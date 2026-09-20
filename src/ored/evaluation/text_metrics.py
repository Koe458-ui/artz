from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple


def build_template_patterns(grammar: Dict[str, object]) -> List[re.Pattern]:
    slots = {
        "adj": grammar["adjectives"],
        "noun": grammar["nouns"],
        "name": grammar["names"],
        "verb_s": grammar["verbs_singular"],
        "verb_p": grammar["verbs_plural"],
    }

    patterns: List[re.Pattern] = []
    for template in grammar["templates"]:
        pattern = re.escape(template)
        for slot, words in slots.items():
            alternation = "(?:" + "|".join(sorted(words, key=len, reverse=True)) + ")"
            pattern = pattern.replace(re.escape("{" + slot + "}"), alternation)
            pattern = pattern.replace("\\{" + slot + "\\}", alternation)
            pattern = pattern.replace("{" + slot + "}", alternation)
        patterns.append(re.compile("^" + pattern + "$"))
    return patterns


ARITHMETIC_LINE = re.compile(r"^(\d+) \+ (\d+) = (\d+)$")


def format_expected(total: int, reverse_answer: bool) -> str:
    text = str(total)
    return f"{text[::-1]} (= {text} reversed)" if reverse_answer else text


@dataclass
class TextQuality:

    total_lines: int = 0
    grammatical_lines: int = 0
    arithmetic_lines: int = 0
    arithmetic_correct: int = 0
    malformed_lines: int = 0
    examples_bad: List[str] = field(default_factory=list)

    @property
    def valid_lines(self) -> int:
        return self.grammatical_lines + self.arithmetic_lines

    @property
    def well_formed_rate(self) -> float:
        return self.valid_lines / self.total_lines if self.total_lines else 0.0

    @property
    def arithmetic_rate(self) -> float:
        return self.arithmetic_correct / self.arithmetic_lines if self.arithmetic_lines else 0.0


def score_text(text: str, grammar: Dict[str, object], keep_examples: int = 5,
               reverse_answer: bool = False) -> TextQuality:
    patterns = build_template_patterns(grammar)
    lines = text.split("\n")
    if len(lines) > 2:
        lines = lines[1:-1]

    quality = TextQuality()
    for line in lines:
        line = line.strip()
        if not line:
            continue
        quality.total_lines += 1

        match = ARITHMETIC_LINE.match(line)
        if match:
            quality.arithmetic_lines += 1
            a, b = int(match.group(1)), int(match.group(2))
            written = match.group(3)
            claimed = int(written[::-1] if reverse_answer else written)
            if a + b == claimed:
                quality.arithmetic_correct += 1
            elif len(quality.examples_bad) < keep_examples:
                expected = format_expected(a + b, reverse_answer)
                quality.examples_bad.append(f"{line}   (should be {expected})")
            continue

        if any(pattern.match(line) for pattern in patterns):
            quality.grammatical_lines += 1
        else:
            quality.malformed_lines += 1
            if len(quality.examples_bad) < keep_examples:
                quality.examples_bad.append(line)

    return quality


@dataclass
class ArithmeticResult:

    total: int = 0
    correct: int = 0
    parse_failures: int = 0
    mistakes: List[str] = field(default_factory=list)

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0


def score_arithmetic(
    completions: Sequence[Tuple[int, int, str]],
    keep_mistakes: int = 8,
    reverse_answer: bool = False,
) -> ArithmeticResult:
    result = ArithmeticResult()
    for a, b, completion in completions:
        result.total += 1
        expected = a + b
        shown = format_expected(expected, reverse_answer)
        cleaned = completion.strip()

        if not cleaned.isdigit():
            result.parse_failures += 1
            if len(result.mistakes) < keep_mistakes:
                result.mistakes.append(f"{a} + {b} = {cleaned!r}  (not a number; expected {shown})")
            continue

        if int(cleaned[::-1] if reverse_answer else cleaned) == expected:
            result.correct += 1
        elif len(result.mistakes) < keep_mistakes:
            result.mistakes.append(f"{a} + {b} = {cleaned}  (expected {shown})")

    return result
