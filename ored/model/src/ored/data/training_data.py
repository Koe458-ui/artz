from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

FINGERPRINT_VERSION = "v1"
TEXT_FORMAT_VERSION = 1
SEPARATOR = "\x1f"

MAX_INPUT_CHARS = 10000
MAX_OUTPUT_CHARS = 10000
MAX_METADATA_KEYS = 50

TYPES: Dict[str, Tuple[str, str]] = {
    "qna": ("Question", "Answer"),
    "fact": ("Question", "Answer"),
    "definition": ("Term", "Definition"),
    "vocabulary": ("Word", "Meaning"),
    "sentence": ("Prompt", "Sentence"),
    "conversation": ("User", "Assistant"),
    "instruction": ("Instruction", "Response"),
    "comprehension": ("Passage", "Answer"),
    "correction": ("Incorrect", "Correct"),
    "translation": ("Translate", "Translation"),
    "math": ("Problem", "Solution"),
    "reasoning": ("Problem", "Answer"),
    "writing": ("Task", "Text"),
    "classification": ("Text", "Label"),
}

TAXONOMY: Dict[str, Dict[str, List[str]]] = {
    "language_foundation": {s: [] for s in (
        "alphabet", "uppercase_letters", "lowercase_letters", "digits", "punctuation", "symbols",
        "vocabulary", "common_words", "word_meanings", "synonyms", "antonyms", "homonyms",
        "homophones", "abbreviations", "common_expressions")},
    "grammar": {s: [] for s in (
        "nouns", "pronouns", "verbs", "adjectives", "adverbs", "prepositions", "conjunctions",
        "articles", "singular_plural", "tenses", "active_passive_voice", "direct_indirect_speech",
        "sentence_structure", "clauses", "conditionals", "grammar_correction", "english_grammar")},
    "sentences": {s: [] for s in (
        "simple", "compound", "complex", "questions", "answers", "commands", "requests",
        "statements", "descriptions", "explanations", "sentence_completion")},
    "general_knowledge": {s: [] for s in (
        "everyday_facts", "people", "places", "countries", "cities", "continents", "oceans",
        "landmarks", "history", "geography", "culture", "society", "civics", "economics",
        "commerce", "philosophy", "art_and_artists", "outdoor_sports", "online_games")},
    "qna": {s: [] for s in (
        "factual", "definition", "explanation", "comparison", "how_to", "why", "what", "who",
        "where", "when", "how")},
    "conversation": {s: [] for s in (
        "greetings", "introductions", "casual_conversation", "follow_up_questions",
        "acknowledgements", "thanks", "apologies", "clarification", "uncertainty", "corrections",
        "multi_turn", "context_continuation")},
    "mathematics": {s: [] for s in (
        "numbers", "counting", "addition", "subtraction", "multiplication", "division", "fractions",
        "decimals", "percentages", "ratios", "proportions", "averages", "powers", "roots",
        "algebra", "equations", "inequalities", "sequences", "sets", "geometry", "trigonometry",
        "coordinate_geometry", "probability", "statistics", "calculus", "unit_conversion",
        "mathematical_reasoning", "arithmetic")},
    "science": {
        "physics": [
            "units", "measurements", "vectors", "kinematics", "mechanics", "work", "energy", "power",
            "momentum", "gravitation", "rotational_motion", "matter", "fluids", "thermodynamics",
            "kinetic_theory", "waves", "sound", "optics", "electricity", "magnetism",
            "electromagnetism", "circuits", "semiconductors", "electronics", "quantum_physics",
            "atomic_physics", "nuclear_physics", "relativity", "astrophysics"],
        "chemistry": [
            "atoms", "molecules", "elements", "periodic_table", "chemical_bonding",
            "chemical_reactions", "stoichiometry", "acids_bases", "salts", "solutions", "gases",
            "thermochemistry", "equilibrium", "kinetics", "electrochemistry", "organic_chemistry",
            "inorganic_chemistry", "physical_chemistry", "biochemistry"],
        "biology": [
            "cells", "genetics", "dna_rna", "evolution", "anatomy", "physiology", "microbiology",
            "botany", "zoology", "ecology", "ecosystems", "reproduction", "metabolism",
            "biotechnology"],
        "astronomy": [],
    },
    "computer_science": {s: [] for s in (
        "computer_fundamentals", "hardware", "software", "operating_systems", "programming",
        "algorithms", "data_structures", "databases", "networking", "web_development",
        "cybersecurity_concepts", "artificial_intelligence", "machine_learning", "neural_networks",
        "computer_architecture", "programming_languages")},
    "engineering": {s: [] for s in (
        "electrical_engineering", "electronics", "digital_electronics", "analog_electronics", "vlsi",
        "microelectronics", "communication_systems", "telecommunications", "mechanical_engineering",
        "civil_engineering", "materials_science", "robotics", "control_systems")},
    "reasoning": {s: [] for s in (
        "logical_reasoning", "pattern_recognition", "sequence_reasoning", "classification",
        "analogy", "deduction", "induction", "cause_effect", "comparison", "multi_step_reasoning",
        "mathematical_reasoning", "verbal_reasoning", "reasoning_explanations")},
    "instructions": {s: [] for s in (
        "simple_instructions", "multi_step_instructions", "formatting", "task_completion",
        "summarization", "rewriting", "classification", "extraction", "transformation",
        "instruction_with_context")},
    "reading": {s: [] for s in (
        "passages", "fact_extraction", "question_answering", "summarization", "main_idea",
        "details", "inference", "context_understanding", "paragraph_ordering")},
    "writing": {s: [] for s in (
        "paragraphs", "essays", "explanations", "descriptions", "stories", "dialogues", "emails",
        "messages", "reports", "notes", "structured_writing")},
    "language_skills": {s: [] for s in (
        "translation", "paraphrasing", "summarization", "text_correction", "spelling_correction",
        "grammar_correction", "classification", "keyword_extraction", "terminology", "linguistics")},
    "data": {s: [] for s in (
        "tables", "lists", "structured_data", "data_interpretation", "charts", "percentages",
        "measurements", "units", "conversions")},
    "everyday": {s: [] for s in (
        "time", "dates", "calendars", "money", "food", "household_objects", "transportation",
        "education", "work", "communication", "common_activities")},
    "safety": {s: [] for s in (
        "uncertainty", "admitting_lack_of_knowledge", "clarification", "privacy",
        "responsible_handling")},
    "ored": {s: [] for s in (
        "assistant_identity", "response_format", "conversation_style", "context_handling",
        "question_clarification", "factual_correction", "uncertainty_handling",
        "response_examples")},
}

CATEGORIES: Tuple[str, ...] = tuple(TAXONOMY)
DIFFICULTIES: Tuple[str, ...] = ("beginner", "intermediate", "advanced", "expert")

WHITESPACE = re.compile(r"[ \t\n\r\f\v]+")
SLUG_SEPARATORS = re.compile(r"[ /-]+")
SLUG = re.compile(r"^[a-z0-9][a-z0-9_]{0,63}$")
SOURCE = re.compile(r"^[a-z0-9][a-z0-9_]{0,31}$")
LANGUAGE = re.compile(r"^[a-z]{2,3}(-[a-z0-9]{2,8})*$")
DATASET_TAG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
FINGERPRINT = re.compile(r"^[0-9a-f]{64}$")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
BLANK_LINES = re.compile(r"\n{3,}")
ALL_TAGS = "all"
EDGE = " \t\n\r\f\v"


def slug(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = SLUG_SEPARATORS.sub("_", value.strip(EDGE).lower())
    return text or None


def language_code(value: Optional[str]) -> str:
    return (value or "").strip(EDGE).lower()


def optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip(EDGE)
    return text or None


def normal_key(value: Optional[str]) -> str:
    return normal_text(value).lower()


def normal_text(value: Optional[str]) -> str:
    return WHITESPACE.sub(" ", unicodedata.normalize("NFC", value or "")).strip(" ")


def fingerprint_of(type: str, category: str, subject: Optional[str], topic: Optional[str],
                   input: str, output: str, language: str) -> str:
    parts = [
        FINGERPRINT_VERSION,
        normal_key(type),
        normal_key(category),
        normal_key(subject),
        normal_key(topic),
        normal_key(language),
        normal_text(input),
        normal_text(output),
    ]
    return hashlib.sha256(SEPARATOR.join(parts).encode("utf-8")).hexdigest()


def fingerprint(record: Any) -> str:
    return fingerprint_of(record.type, record.category, record.subject, record.topic,
                          record.input, record.output, record.language)


def normalise_fields(record: Any) -> Any:
    record.type = slug(record.type) or ""
    record.category = slug(record.category) or ""
    record.subject = slug(record.subject)
    record.topic = slug(record.topic)
    record.difficulty = slug(record.difficulty)
    record.language = language_code(record.language) or "en"
    record.source = slug(record.source) or "manual"
    record.dataset_tag = optional_text(record.dataset_tag)
    record.metadata = dict(record.metadata or {})
    record.fingerprint = fingerprint(record)
    return record


@dataclass
class RecordCheck:

    record_id: str
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def describe(self) -> str:
        lines = [f"{self.record_id}: {e}" for e in self.errors]
        lines += [f"{self.record_id}: warning: {w}" for w in self.warnings]
        return "\n".join(lines)


def _text_problems(name: str, value: Any, limit: int) -> List[str]:
    if not isinstance(value, str):
        return [f"{name} must be text, got {type(value).__name__}"]
    problems = []
    if not value.strip():
        problems.append(f"{name} is empty")
    if len(value) > limit:
        problems.append(f"{name} is {len(value)} characters, the limit is {limit}")
    if CONTROL.search(value):
        problems.append(f"{name} contains a control character (only tab and newline are allowed)")
    if "�" in value:
        problems.append(f"{name} contains U+FFFD, the sign of text that was decoded wrongly")
    if any(0xD800 <= ord(c) <= 0xDFFF for c in value):
        problems.append(f"{name} contains an unpaired surrogate, which is not valid Unicode")
    return problems


def check_record(record: Any) -> RecordCheck:
    check = RecordCheck(str(getattr(record, "id", "") or "<new>"))
    errors, warnings = check.errors, check.warnings

    if record.type not in TYPES:
        errors.append(f"type {record.type!r} is not one of {', '.join(TYPES)}")
    if record.category not in TAXONOMY:
        errors.append(f"category {record.category!r} is not one of {', '.join(CATEGORIES)}")
    for name in ("subject", "topic"):
        value = getattr(record, name)
        if value is not None and not (isinstance(value, str) and SLUG.match(value)):
            errors.append(f"{name} {value!r} must be lowercase letters, digits and _ (at most 64)")
    if record.difficulty is not None and record.difficulty not in DIFFICULTIES:
        errors.append(f"difficulty {record.difficulty!r} is not one of {', '.join(DIFFICULTIES)}")
    if not (isinstance(record.language, str) and LANGUAGE.match(record.language)):
        errors.append(f"language {record.language!r} is not a language code such as en or pt-br")
    if not (isinstance(record.source, str) and SOURCE.match(record.source)):
        errors.append(f"source {record.source!r} must be lowercase letters, digits and _")
    if record.dataset_tag is not None and not (
        isinstance(record.dataset_tag, str) and DATASET_TAG.match(record.dataset_tag)
        and record.dataset_tag != ALL_TAGS
    ):
        errors.append(f"dataset_tag {record.dataset_tag!r} must be letters, digits, _ . - and not 'all'")
    for name in ("enabled", "verified"):
        if not isinstance(getattr(record, name), bool):
            errors.append(f"{name} must be true or false, got {getattr(record, name)!r}")
    if not isinstance(record.metadata, dict):
        errors.append("metadata must be a JSON object")
    elif len(record.metadata) > MAX_METADATA_KEYS:
        errors.append(f"metadata has {len(record.metadata)} keys, the limit is {MAX_METADATA_KEYS}")

    errors += _text_problems("input", record.input, MAX_INPUT_CHARS)
    errors += _text_problems("output", record.output, MAX_OUTPUT_CHARS)

    if not errors:
        expected = fingerprint(record)
        if record.fingerprint != expected:
            errors.append(f"fingerprint {record.fingerprint or '(none)'} does not match its content "
                          f"({expected}); the row was changed without its fingerprint")
    elif record.fingerprint and not FINGERPRINT.match(str(record.fingerprint)):
        errors.append("fingerprint is not a sha256 hex digest")

    subjects = TAXONOMY.get(record.category, {})
    if not errors and record.subject and subjects and record.subject not in subjects:
        warnings.append(f"subject {record.subject!r} is not a known {record.category} subject")
    topics = subjects.get(record.subject or "", [])
    if not errors and record.topic and topics and record.topic not in topics:
        warnings.append(f"topic {record.topic!r} is not a known {record.subject} topic")
    if not errors and normal_text(record.input) == normal_text(record.output):
        warnings.append("input and output are the same text")
    return check


def check_records(records: Iterable[Any]) -> List[RecordCheck]:
    return [check_record(r) for r in records]


def clean_block(text: str) -> str:
    text = unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip(" \t") for line in text.split("\n")]
    return BLANK_LINES.sub("\n\n", "\n".join(lines)).strip("\n ")


def format_record(record: Any) -> str:
    first, second = TYPES[record.type]
    return f"{first}: {clean_block(record.input)}\n{second}: {clean_block(record.output)}"


def group_key(record: Any) -> str:
    group = (record.metadata or {}).get("group") if isinstance(record.metadata, dict) else None
    if isinstance(group, (str, int)) and str(group).strip():
        return "group:" + normal_text(str(group)).casefold()
    return "input:" + normal_text(record.input).casefold()


def split_of(group: str, seed: int, fractions: Mapping[str, float]) -> str:
    digest = hashlib.sha256(f"{seed}{SEPARATOR}{group}".encode("utf-8")).digest()
    position = int.from_bytes(digest[:8], "big") / float(1 << 64)
    if position < fractions["train"]:
        return "train"
    if position < fractions["train"] + fractions["val"]:
        return "val"
    return "test"


def taxonomy_lines(categories: Optional[Sequence[str]] = None) -> List[str]:
    lines = []
    for category in categories or CATEGORIES:
        subjects = TAXONOMY.get(category, {})
        lines.append(f"{category}: {', '.join(subjects) or '(any subject)'}")
        for subject, topics in subjects.items():
            if topics:
                lines.append(f"  {subject}: {', '.join(topics)}")
    return lines


SELECTION_MODES = ("verified", "unverified_too", "everything")


@dataclass
class Selection:

    dataset_tag: str = ALL_TAGS
    types: List[str] = field(default_factory=list)
    categories: List[str] = field(default_factory=list)
    subjects: List[str] = field(default_factory=list)
    languages: List[str] = field(default_factory=list)
    mode: str = "verified"
    as_of: Optional[str] = None

    def validate(self) -> "Selection":
        if self.mode not in SELECTION_MODES:
            raise ValueError(f"selection mode must be one of {', '.join(SELECTION_MODES)}")
        if self.dataset_tag != ALL_TAGS and not DATASET_TAG.match(self.dataset_tag or ""):
            raise ValueError(f"dataset tag {self.dataset_tag!r} must be letters, digits, _ . - "
                             f"(or 'all' for every row)")
        self.types = sorted({slug(t) or "" for t in self.types})
        self.categories = sorted({slug(c) or "" for c in self.categories})
        self.subjects = sorted({slug(s) or "" for s in self.subjects})
        self.languages = sorted({language_code(l) for l in self.languages})
        for name, values, pattern in (("type", self.types, SLUG), ("category", self.categories, SLUG),
                                      ("subject", self.subjects, SLUG),
                                      ("language", self.languages, LANGUAGE)):
            bad = [v for v in values if not pattern.match(v)]
            if bad:
                raise ValueError(f"{name} filter {bad} is not a valid {name}")
        unknown = [t for t in self.types if t not in TYPES]
        if unknown:
            raise ValueError(f"type filter {unknown} is not one of {', '.join(TYPES)}")
        unknown = [c for c in self.categories if c not in TAXONOMY]
        if unknown:
            raise ValueError(f"category filter {unknown} is not one of {', '.join(CATEGORIES)}")
        return self

    @property
    def enabled_only(self) -> bool:
        return self.mode != "everything"

    @property
    def verified_only(self) -> bool:
        return self.mode == "verified"

    def matches(self, record: Any) -> bool:
        if self.enabled_only and not record.enabled:
            return False
        if self.verified_only and not record.verified:
            return False
        if self.dataset_tag != ALL_TAGS and record.dataset_tag != self.dataset_tag:
            return False
        if self.types and record.type not in self.types:
            return False
        if self.categories and record.category not in self.categories:
            return False
        if self.subjects and record.subject not in self.subjects:
            return False
        if self.languages and record.language not in self.languages:
            return False
        if self.as_of is not None and str(record.updated_at) > self.as_of:
            return False
        return True

    def describe(self) -> str:
        rules = []
        if self.enabled_only:
            rules.append("enabled = true")
        if self.verified_only:
            rules.append("verified = true")
        rules.append("any dataset_tag" if self.dataset_tag == ALL_TAGS
                     else f"dataset_tag = '{self.dataset_tag}'")
        for name, values in (("type", self.types), ("category", self.categories),
                             ("subject", self.subjects), ("language", self.languages)):
            if values:
                rules.append(f"{name} in ({', '.join(values)})")
        if self.as_of:
            rules.append(f"updated_at <= {self.as_of}")
        return " AND ".join(rules)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dataset_tag": self.dataset_tag,
            "types": list(self.types),
            "categories": list(self.categories),
            "subjects": list(self.subjects),
            "languages": list(self.languages),
            "mode": self.mode,
            "enabled_only": self.enabled_only,
            "verified_only": self.verified_only,
            "as_of": self.as_of,
            "rule": self.describe(),
        }
