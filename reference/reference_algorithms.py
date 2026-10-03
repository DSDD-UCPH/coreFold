"""Reference behavior for Protein Minifier V1.

This module is intentionally dependency-light and is meant as an executable
reference for unit tests. Production code may be TypeScript, but should match
these semantics exactly.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import ceil, sqrt
from typing import Iterable, Sequence

WINDOW_SIZE = 5
DEFAULT_PLDDT_THRESHOLD = 50.0
DEFAULT_MIN_CANDIDATE_LENGTH = 30
DEFAULT_MIN_TERMINAL_CANDIDATE_LENGTH = 15
ANGSTROM_PER_RESIDUE = 3.8
FLEXIBILITY_MULTIPLIER = 1.30


@dataclass(frozen=True)
class Interval:
    start: int  # 1-based, inclusive
    end: int    # 1-based, inclusive

    @property
    def length(self) -> int:
        return self.end - self.start + 1


def detect_positive_windows(
    plddt: Sequence[float],
    construct_start: int,
    construct_end: int,
    threshold: float = DEFAULT_PLDDT_THRESHOLD,
) -> list[Interval]:
    """Return 5-aa windows whose arithmetic mean is strictly below threshold."""
    out: list[Interval] = []
    last_start = construct_end - WINDOW_SIZE + 1
    if last_start < construct_start:
        return out

    for start in range(construct_start, last_start + 1):
        zero = start - 1
        vals = plddt[zero : zero + WINDOW_SIZE]
        mean = sum(vals) / WINDOW_SIZE
        if mean < threshold:
            out.append(Interval(start, start + WINDOW_SIZE - 1))
    return out


def merge_overlapping(intervals: Iterable[Interval]) -> list[Interval]:
    """Merge only overlapping intervals. Adjacent non-overlapping intervals stay separate."""
    ordered = sorted(intervals, key=lambda x: (x.start, x.end))
    if not ordered:
        return []

    merged: list[Interval] = [ordered[0]]
    for cur in ordered[1:]:
        prev = merged[-1]
        if cur.start <= prev.end:  # overlap only; adjacency (prev.end+1) does not merge
            merged[-1] = Interval(prev.start, max(prev.end, cur.end))
        else:
            merged.append(cur)
    return merged


def merge_abutting(intervals: Iterable[Interval]) -> list[Interval]:
    """Merge intervals that overlap or abut. Used after the minimum-length filter."""
    ordered = sorted(intervals, key=lambda x: (x.start, x.end))
    if not ordered:
        return []

    merged: list[Interval] = [ordered[0]]
    for cur in ordered[1:]:
        prev = merged[-1]
        if cur.start <= prev.end + 1:
            merged[-1] = Interval(prev.start, max(prev.end, cur.end))
        else:
            merged.append(cur)
    return merged


def detect_candidates(
    plddt: Sequence[float],
    construct_start: int,
    construct_end: int,
    threshold: float = DEFAULT_PLDDT_THRESHOLD,
    min_length: int = DEFAULT_MIN_CANDIDATE_LENGTH,
    min_terminal: int = DEFAULT_MIN_TERMINAL_CANDIDATE_LENGTH,
) -> list[Interval]:
    windows = detect_positive_windows(plddt, construct_start, construct_end, threshold)
    merged = merge_overlapping(windows)
    construct = Interval(construct_start, construct_end)
    filtered = []
    for x in merged:
        klass = classify_candidate(x, construct)
        cutoff = min_length if klass == "internal" else min_terminal
        if x.length >= cutoff:
            filtered.append(x)
    return merge_abutting(filtered)


def classify_candidate(candidate: Interval, construct: Interval) -> str:
    if candidate.start == construct.start and candidate.end == construct.end:
        return "entire_construct"
    if candidate.start == construct.start:
        return "n_terminal"
    if candidate.end == construct.end:
        return "c_terminal"
    return "internal"


def euclidean_distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return sqrt(sum((x - y) ** 2 for x, y in zip(a, b, strict=True)))


def recommended_linker_length(distance_angstrom: float) -> int:
    minimum = ceil(distance_angstrom / ANGSTROM_PER_RESIDUE)
    return ceil(minimum * FLEXIBILITY_MULTIPLIER)


def recommended_linker(distance_angstrom: float) -> str:
    return "G" * recommended_linker_length(distance_angstrom)


def internal_edit_is_beneficial(deleted_length: int, linker_length: int) -> bool:
    return linker_length < 0.5 * deleted_length


def relative_inference_cost(length: int | float) -> float:
    if length <= 0:
        raise ValueError("length must be positive")
    u = float(length) / 1024.0
    return 1.0 + 0.18 * (u - 1.0) + 0.64 * (u**2 - 1.0) + 0.16 * (u**3 - 1.0)


def estimated_throughput_gain(original_length: int, minified_length: int) -> float:
    if original_length <= 0 or minified_length <= 0:
        raise ValueError("sequence lengths must be positive")
    return relative_inference_cost(original_length) / relative_inference_cost(minified_length)


if __name__ == "__main__":
    fixtures = [
        (1024, 512, 3.4482758620689653),
        (812, 604, 1.6897865646642019),
        (4000, 2000, 5.000046175699603),
        (5000, 3000, 3.456355756674062),
    ]
    for old, new, expected in fixtures:
        actual = estimated_throughput_gain(old, new)
        assert abs(actual - expected) < 1e-12, (old, new, actual, expected)

    assert recommended_linker_length(18.6) == 7
    assert recommended_linker(18.6) == "GGGGGGG"
    assert internal_edit_is_beneficial(30, 14)
    assert not internal_edit_is_beneficial(30, 15)

    print("Reference fixtures passed")
