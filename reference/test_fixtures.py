from __future__ import annotations

import json
from pathlib import Path

from reference_algorithms import (
    estimated_throughput_gain,
    internal_edit_is_beneficial,
    merge_abutting,
    merge_overlapping,
    recommended_linker,
    recommended_linker_length,
    Interval,
)

FIXTURES = Path(__file__).resolve().parent.parent / "src" / "domain" / "fixtures" / "reference_fixtures.json"


def test_cross_language_fixtures() -> None:
    data = json.loads(FIXTURES.read_text())
    for row in data["throughput"]:
        actual = estimated_throughput_gain(row["original"], row["minified"])
        assert abs(actual - row["gain"]) < 1e-12, (row, actual)
    for row in data["linker"]:
        assert recommended_linker_length(row["distance"]) == row["recommended"]
        assert recommended_linker(row["distance"]) == row["sequence"]
    for row in data["benefit"]:
        assert internal_edit_is_beneficial(row["deleted"], row["linker"]) is row["recommended"]


def test_window_merge_does_not_gap_fill() -> None:
    merged = merge_overlapping(
        [Interval(10, 14), Interval(15, 19)]
    )
    assert [(x.start, x.end) for x in merged] == [(10, 14), (15, 19)]


def test_abutting_candidates_coalesce() -> None:
    coalesced = merge_abutting([Interval(514, 900), Interval(901, 1023)])
    assert [(x.start, x.end) for x in coalesced] == [(514, 1023)]


if __name__ == "__main__":
    test_cross_language_fixtures()
    test_window_merge_does_not_gap_fill()
    test_abutting_candidates_coalesce()
    print("Cross-language fixtures passed")
