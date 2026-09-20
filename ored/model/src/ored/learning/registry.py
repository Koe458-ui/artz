from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from ored.learning.records import (
    ModelVersion,
    SessionStatus,
    TrainingSession,
    VersionStatus,
    now,
)
from ored.learning.store import LearningStore


class PromotionError(RuntimeError):
    pass


@dataclass
class PromotionPolicy:

    metric: str = "val_loss"
    lower_is_better: bool = True
    min_improvement: float = 0.0
    min_examples: int = 200
    min_conversations: int = 50

    def compares(self, candidate: float, incumbent: float) -> bool:
        if self.lower_is_better:
            return candidate <= incumbent - self.min_improvement
        return candidate >= incumbent + self.min_improvement


def record_version(
    store: LearningStore,
    version: str,
    session: TrainingSession,
    checkpoint_path: str,
    notes: str = "",
) -> ModelVersion:
    if session.status is not SessionStatus.EVALUATED:
        raise PromotionError("only an evaluated session produces a model version")
    return store.add_version(
        ModelVersion(
            version=version,
            session_id=session.id,
            checkpoint_path=checkpoint_path,
            metrics=dict(session.metrics),
            notes=notes,
        )
    )


def production(store: LearningStore) -> Optional[ModelVersion]:
    live = store.versions(VersionStatus.PRODUCTION)
    return live[-1] if live else None


def check_promotable(
    store: LearningStore,
    version: ModelVersion,
    session: TrainingSession,
    policy: Optional[PromotionPolicy] = None,
) -> List[str]:
    policy = policy or PromotionPolicy()
    blockers: List[str] = []

    if version.status is not VersionStatus.CANDIDATE:
        blockers.append(f"version {version.version} is {version.status.value}, not a candidate")
    if session.status is not SessionStatus.EVALUATED:
        blockers.append("the training session behind it has not been evaluated")
    if session.example_count < policy.min_examples:
        blockers.append(
            f"trained on {session.example_count} approved examples, "
            f"policy requires {policy.min_examples}"
        )
    if session.conversation_count < policy.min_conversations:
        blockers.append(
            f"trained on {session.conversation_count} conversations, "
            f"policy requires {policy.min_conversations}"
        )

    score = version.metrics.get(policy.metric)
    if score is None:
        blockers.append(f"no {policy.metric} recorded for this version")
    else:
        live = production(store)
        incumbent = live.metrics.get(policy.metric) if live else None
        if incumbent is not None and not policy.compares(score, incumbent):
            blockers.append(
                f"{policy.metric} {score} does not beat the live version's {incumbent}"
            )

    return blockers


def promote(
    store: LearningStore,
    version: ModelVersion,
    session: TrainingSession,
    policy: Optional[PromotionPolicy] = None,
) -> ModelVersion:
    blockers = check_promotable(store, version, session, policy)
    if blockers:
        raise PromotionError("; ".join(blockers))

    live = production(store)
    if live is not None:
        live.status = VersionStatus.RETIRED
        store.update_version(live)

    version.status = VersionStatus.PRODUCTION
    version.promoted_at = now()
    return store.update_version(version)


def history(store: LearningStore) -> Dict[str, List[ModelVersion]]:
    return {
        "candidate": store.versions(VersionStatus.CANDIDATE),
        "production": store.versions(VersionStatus.PRODUCTION),
        "retired": store.versions(VersionStatus.RETIRED),
    }
