from __future__ import annotations

import pytest

from ored.learning import (
    CandidateStatus,
    Conversation,
    InMemoryStore,
    Message,
    PromotionError,
    PromotionPolicy,
    ReviewError,
    Role,
    SessionStatus,
    VersionStatus,
    approve,
    build_candidates,
    check_promotable,
    production,
    promote,
    record_version,
    redact,
    reject,
)
from ored.learning import dataset as ds
from ored.learning import sessions as sess


def conversation_with(store, turns):
    conversation = Conversation(user_id="member")
    store.add_conversation(conversation)
    messages = []
    for index, (prompt, response) in enumerate(turns):
        stamp = f"2026-01-01T00:00:{index * 2:02d}Z"
        next_stamp = f"2026-01-01T00:00:{index * 2 + 1:02d}Z"
        messages.append(Message(conversation_id=conversation.id, role=Role.USER,
                                content=prompt, created_at=stamp))
        messages.append(Message(conversation_id=conversation.id, role=Role.ASSISTANT,
                                content=response, created_at=next_stamp))
    store.add_messages(messages)
    return conversation


@pytest.fixture()
def store():
    return InMemoryStore()


def test_stored_messages_are_not_learning_data(store):
    conversation = conversation_with(store, [("a question here", "an answer here")])
    assert store.messages_for(conversation.id)
    assert store.candidates() == []


def test_candidates_start_pending(store):
    conversation = conversation_with(store, [("a question here", "an answer here")])
    candidates = build_candidates(conversation.id, store.messages_for(conversation.id))
    assert len(candidates) == 1
    assert candidates[0].status is CandidateStatus.PENDING


def test_short_turns_are_not_candidates(store):
    conversation = conversation_with(store, [("hi", "ok")])
    assert build_candidates(conversation.id, store.messages_for(conversation.id)) == []


def test_repeated_turns_are_collected_once(store):
    conversation = conversation_with(store, [("a question here", "an answer here")] * 3)
    candidates = build_candidates(conversation.id, store.messages_for(conversation.id))
    assert len(candidates) == 1


def test_contact_details_are_removed():
    cleaned, changed = redact("write to name.surname@example.com")
    assert changed
    assert "@example.com" not in cleaned


def test_redaction_is_recorded_on_the_candidate(store):
    conversation = conversation_with(
        store, [("reach me at name.surname@example.com", "a long enough answer here")])
    candidate = build_candidates(conversation.id, store.messages_for(conversation.id))[0]
    assert candidate.redacted


def test_approval_needs_a_reviewer(store):
    conversation = conversation_with(store, [("a question here", "an answer here")])
    candidate = store.add_candidates(
        build_candidates(conversation.id, store.messages_for(conversation.id)))[0]
    with pytest.raises(ReviewError):
        approve(store, candidate, reviewer="", dataset_tag="v1")


def test_approval_files_an_example(store):
    conversation = conversation_with(store, [("a question here", "an answer here")])
    candidate = store.add_candidates(
        build_candidates(conversation.id, store.messages_for(conversation.id)))[0]
    example = approve(store, candidate, reviewer="admin", dataset_tag="v1")
    assert candidate.status is CandidateStatus.APPROVED
    assert store.examples("v1") == [example]


def test_a_rejected_candidate_cannot_be_approved(store):
    conversation = conversation_with(store, [("a question here", "an answer here")])
    candidate = store.add_candidates(
        build_candidates(conversation.id, store.messages_for(conversation.id)))[0]
    reject(store, candidate, reviewer="admin")
    with pytest.raises(ReviewError):
        approve(store, candidate, reviewer="admin", dataset_tag="v1")


def test_a_thin_dataset_is_refused(store):
    conversation = conversation_with(store, [("a question here", "an answer here")])
    candidate = store.add_candidates(
        build_candidates(conversation.id, store.messages_for(conversation.id)))[0]
    approve(store, candidate, reviewer="admin", dataset_tag="v1")
    with pytest.raises(ds.DatasetError):
        ds.export(store, ds.DatasetSpec(tag="v1"))


def test_dataset_export_writes_a_split(store, tmp_path):
    for index in range(20):
        conversation = conversation_with(
            store, [(f"question number {index} here", f"answer number {index} here")])
        candidate = store.add_candidates(
            build_candidates(conversation.id, store.messages_for(conversation.id)))[0]
        approve(store, candidate, reviewer="admin", dataset_tag="v1")

    spec = ds.DatasetSpec(tag="v1", min_examples=10, min_conversations=10)
    report = ds.export(store, spec, out_dir=tmp_path)
    assert report.train + report.val == 20
    assert report.val >= 1
    assert report.path.exists()


def test_a_session_needs_examples(store):
    with pytest.raises(sess.SessionError):
        sess.queue(store, "v1", {}, example_count=0, conversation_count=0)


def test_a_session_is_evaluated_before_it_yields_a_version(store):
    session = sess.queue(store, "v1", {}, example_count=300, conversation_count=80)
    with pytest.raises(PromotionError):
        record_version(store, "0.2.0", session, "checkpoints/v1/best.pt")


def test_a_failed_session_cannot_be_evaluated(store):
    session = sess.queue(store, "v1", {}, example_count=300, conversation_count=80)
    sess.start(store, session)
    sess.fail(store, session, "diverged")
    with pytest.raises(sess.SessionError):
        sess.finish(store, session, {"val_loss": 0.1})


def evaluated(store, examples=300, conversations=80, val_loss=0.4):
    session = sess.queue(store, "v1", {}, example_count=examples, conversation_count=conversations)
    sess.start(store, session)
    sess.finish(store, session, {"val_loss": val_loss})
    return session


def test_one_conversation_cannot_move_production(store):
    session = evaluated(store, examples=1, conversations=1)
    version = record_version(store, "0.2.0", session, "checkpoints/v1/best.pt")
    blockers = check_promotable(store, version, session)
    assert blockers
    with pytest.raises(PromotionError):
        promote(store, version, session)
    assert production(store) is None


def test_a_qualified_version_is_promoted(store):
    session = evaluated(store)
    version = record_version(store, "0.2.0", session, "checkpoints/v1/best.pt")
    promote(store, version, session)
    assert version.status is VersionStatus.PRODUCTION
    assert production(store).version == "0.2.0"


def test_a_worse_version_does_not_replace_the_live_one(store):
    first = evaluated(store, val_loss=0.30)
    live = record_version(store, "0.2.0", first, "checkpoints/a/best.pt")
    promote(store, live, first)

    second = evaluated(store, val_loss=0.90)
    challenger = record_version(store, "0.3.0", second, "checkpoints/b/best.pt")
    with pytest.raises(PromotionError):
        promote(store, challenger, second)
    assert production(store).version == "0.2.0"


def test_promoting_retires_the_previous_version(store):
    first = evaluated(store, val_loss=0.30)
    live = record_version(store, "0.2.0", first, "checkpoints/a/best.pt")
    promote(store, live, first)

    second = evaluated(store, val_loss=0.10)
    challenger = record_version(store, "0.3.0", second, "checkpoints/b/best.pt")
    promote(store, challenger, second)

    assert live.status is VersionStatus.RETIRED
    assert production(store).version == "0.3.0"


def test_policy_can_require_a_margin(store):
    policy = PromotionPolicy(min_improvement=0.05, min_examples=1, min_conversations=1)
    first = evaluated(store, examples=1, conversations=1, val_loss=0.30)
    live = record_version(store, "0.2.0", first, "checkpoints/a/best.pt")
    promote(store, live, first, policy)

    second = evaluated(store, examples=1, conversations=1, val_loss=0.28)
    challenger = record_version(store, "0.3.0", second, "checkpoints/b/best.pt")
    with pytest.raises(PromotionError):
        promote(store, challenger, second, policy)


def test_session_states_are_recorded(store):
    session = evaluated(store)
    assert session.status is SessionStatus.EVALUATED
    assert store.sessions(SessionStatus.EVALUATED) == [session]


def test_dataset_specs_are_read_from_the_store(store):
    from ored.learning import Dataset

    store.add_dataset(Dataset(
        name='bit_addition',
        kind='tabular',
        generator='scripts/generate_dataset.py',
        spec={'rows': 256},
        samples=[{'split': 'train'}],
    ))
    store.add_dataset(Dataset(name='char_corpus', kind='text'))

    assert [d.name for d in store.datasets()] == ['bit_addition', 'char_corpus']

    only = store.datasets('char_corpus')
    assert len(only) == 1 and only[0].kind == 'text'

    assert store.datasets('nothing_here') == []


def test_a_dataset_carries_its_spec_not_a_file_path_alone(store):
    from ored.learning import Dataset

    store.add_dataset(Dataset(name='bit_addition', spec={'rows': 256}, samples=[{'a': 0}]))
    found = store.datasets('bit_addition')[0]
    assert found.spec['rows'] == 256
    assert found.samples
