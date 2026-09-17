import fixtures from "./fixtures/reference_fixtures.json";
import { overlappingFeatures } from "./annotations";
import { classifyCandidate, clampIntervalToConstruct, residueInConstruct } from "./candidates";
import {
  EditValidationError,
  clampDeletionBounds,
  coalesceTouchingDeletions,
  validateAppliedEdits,
} from "./edits";
import { euclideanDistance } from "./geometry";
import {
  internalEditIsBeneficial,
  minimumLinkerLength,
  recommendedLinker,
  recommendedLinkerLength,
} from "./linkers";
import {
  detectCandidateIntervals,
  detectPositiveWindows,
  filterByMinimumLength,
  mergeAbutting,
  mergeOverlapping,
  validateAnalysisInput,
} from "./plddt";
import { reconstructMinifiedSequence } from "./reconstruction";
import { buildResidueMap, minifiedSequenceFromMap } from "./residueMap";
import { estimatedThroughputGain, showFullLengthThroughputComparison } from "./throughput";
import {
  constructFromDomainIds,
  constructFromRange,
  initialConstruct,
  selectableFeatures,
} from "./proposal";
import type { Edit, ProteinRecord } from "./types";

function windowPlddt(values: number[]): number[] {
  return values;
}

describe("rolling pLDDT", () => {
  it("does not mark a mean of exactly 50 as positive", () => {
    const plddt = windowPlddt([50, 50, 50, 50, 50]);
    expect(detectPositiveWindows(plddt, 1, 5)).toEqual([]);
  });

  it("marks a mean of 49.999 as positive", () => {
    const plddt = windowPlddt([49.999, 49.999, 49.999, 49.999, 49.999]);
    expect(detectPositiveWindows(plddt, 1, 5)).toEqual([{ start: 1, end: 5 }]);
  });

  it("allows a single high residue inside a positive window", () => {
    const plddt = [40, 40, 80, 40, 40];
    expect(detectPositiveWindows(plddt, 1, 5)).toEqual([{ start: 1, end: 5 }]);
  });

  it("rejects mismatched sequence and pLDDT lengths", () => {
    expect(() =>
      validateAnalysisInput({
        sequence: "AAA",
        plddt: [1, 2],
        constructStart: 1,
        constructEnd: 2,
      }),
    ).toThrow(/does not match/);
  });
});

describe("merging", () => {
  it("merges overlapping windows", () => {
    expect(mergeOverlapping([{ start: 10, end: 14 }, { start: 11, end: 15 }, { start: 12, end: 16 }])).toEqual([
      { start: 10, end: 16 },
    ]);
  });

  it("does not gap-fill adjacent windows", () => {
    expect(mergeOverlapping([{ start: 10, end: 14 }, { start: 15, end: 19 }])).toEqual([
      { start: 10, end: 14 },
      { start: 15, end: 19 },
    ]);
  });

  it("coalesces abutting retained candidates after the length filter", () => {
    expect(mergeAbutting([{ start: 514, end: 900 }, { start: 901, end: 1023 }])).toEqual([
      { start: 514, end: 1023 },
    ]);
  });
});

describe("minimum length", () => {
  it("uses 15 residues for terminal regions and 30 for internal", () => {
    expect(
      filterByMinimumLength([{ start: 1, end: 14 }], { start: 1, end: 200 }, 30, 15),
    ).toEqual([]);
    expect(
      filterByMinimumLength([{ start: 1, end: 15 }], { start: 1, end: 200 }, 30, 15),
    ).toEqual([{ start: 1, end: 15 }]);
    expect(
      filterByMinimumLength([{ start: 10, end: 38 }], { start: 1, end: 200 }, 30, 15),
    ).toEqual([]);
    expect(
      filterByMinimumLength([{ start: 10, end: 39 }], { start: 1, end: 200 }, 30, 15),
    ).toEqual([{ start: 10, end: 39 }]);
  });

  it("detects a 15-residue terminal stretch and drops a 14-residue one", () => {
    expect(
      detectCandidateIntervals({
        sequence: "A".repeat(14),
        plddt: Array.from({ length: 14 }, () => 10),
        constructStart: 1,
        constructEnd: 14,
        minimumCandidateLength: 30,
        minimumTerminalCandidateLength: 15,
      }),
    ).toEqual([]);
    expect(
      detectCandidateIntervals({
        sequence: "A".repeat(15),
        plddt: Array.from({ length: 15 }, () => 10),
        constructStart: 1,
        constructEnd: 15,
        minimumCandidateLength: 30,
        minimumTerminalCandidateLength: 15,
      }),
    ).toEqual([{ start: 1, end: 15 }]);
  });
});

describe("terminal classification", () => {
  const construct = { start: 100, end: 400 };
  it("classifies terminal, internal and entire-construct intervals", () => {
    expect(classifyCandidate({ start: 100, end: 140 }, construct)).toBe("n_terminal");
    expect(classifyCandidate({ start: 350, end: 400 }, construct)).toBe("c_terminal");
    expect(classifyCandidate({ start: 105, end: 140 }, construct)).toBe("internal");
    expect(classifyCandidate({ start: 100, end: 400 }, construct)).toBe("entire_construct");
  });

  it("clamps a selection onto the active construct", () => {
    expect(clampIntervalToConstruct({ start: 1, end: 50 }, construct)).toBeUndefined();
    expect(clampIntervalToConstruct({ start: 200, end: 300 }, construct)).toEqual({
      start: 200,
      end: 300,
    });
    expect(clampIntervalToConstruct({ start: 50, end: 150 }, construct)).toEqual({
      start: 100,
      end: 150,
    });
    expect(residueInConstruct(99, construct)).toBe(false);
    expect(residueInConstruct(100, construct)).toBe(true);
  });
});

describe("linker formula", () => {
  it("matches the reference fixtures", () => {
    for (const row of fixtures.linker) {
      expect(minimumLinkerLength(row.distance)).toBe(row.minimum);
      expect(recommendedLinkerLength(row.distance)).toBe(row.recommended);
      expect(recommendedLinker(row.distance)).toBe(row.sequence);
    }
  });

  it("computes Euclidean Cα distance", () => {
    expect(euclideanDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });
});

describe("internal benefit rule", () => {
  it("uses a strict < 50% comparison", () => {
    for (const row of fixtures.benefit) {
      expect(internalEditIsBeneficial(row.deleted, row.linker)).toBe(row.recommended);
    }
  });
});

describe("throughput", () => {
  it("matches the cubic fixtures", () => {
    for (const row of fixtures.throughput) {
      expect(estimatedThroughputGain(row.original, row.minified)).toBeCloseTo(row.gain, 12);
    }
  });

  it("returns 1.0 for equal lengths and applies above 4000", () => {
    expect(estimatedThroughputGain(100, 100)).toBe(1);
    expect(estimatedThroughputGain(4000, 2000)).toBeGreaterThan(1);
  });

  it("compares any domain or custom construct against full length", () => {
    expect(showFullLengthThroughputComparison({ kind: "domain" })).toBe(true);
    expect(showFullLengthThroughputComparison({ kind: "full_length" })).toBe(false);
  });

  it("reports a throughput loss when the minified sequence is longer than the reference", () => {
    expect(estimatedThroughputGain(252, 264)).toBeLessThan(1);
  });

  it("rejects non-positive lengths", () => {
    expect(() => estimatedThroughputGain(0, 10)).toThrow();
    expect(() => estimatedThroughputGain(10, 0)).toThrow();
  });
});

describe("sequence reconstruction", () => {
  const sequence = "ABCDEFGHIJKL";
  const construct = { start: 1, end: 12 };

  it("applies deletions, replacements and substitutions", () => {
    const deletion: Edit = {
      id: "d",
      type: "deletion",
      source: "user",
      status: "applied",
      start: 3,
      end: 5,
    };
    expect(reconstructMinifiedSequence(sequence, construct, [deletion])).toBe("ABFGHIJKL");

    const replacement: Edit = {
      id: "r",
      type: "replacement",
      source: "user",
      status: "applied",
      start: 3,
      end: 5,
      insertedSequence: "GG",
    };
    expect(reconstructMinifiedSequence(sequence, construct, [replacement])).toBe("ABGGFGHIJKL");

    const substitution: Edit = {
      id: "s",
      type: "substitution",
      source: "share_link",
      status: "applied",
      position: 3,
      fromAA: "C",
      toAA: "W",
    };
    expect(reconstructMinifiedSequence(sequence, construct, [substitution])).toBe("ABWDEFGHIJKL");
  });

  it("rejects overlapping applied edits", () => {
    const edits: Edit[] = [
      { id: "a", type: "deletion", source: "user", status: "applied", start: 2, end: 5 },
      { id: "b", type: "deletion", source: "user", status: "applied", start: 5, end: 7 },
    ];
    expect(() => validateAppliedEdits(edits, construct, 12)).toThrow(EditValidationError);
  });
});

describe("residue mapping", () => {
  it("maps retained, deleted and inserted residues", () => {
    const sequence = "ABCDEFGHIJKL";
    const construct = { start: 1, end: 12 };
    const replacement: Edit = {
      id: "r1",
      type: "replacement",
      source: "user",
      status: "applied",
      start: 3,
      end: 5,
      insertedSequence: "GG",
    };
    const map = buildResidueMap(sequence, construct, [replacement]);
    expect(minifiedSequenceFromMap(map)).toBe("ABGGFGHIJKL");
    expect(map.filter((row) => row.status === "deleted")).toHaveLength(3);
    expect(map.filter((row) => row.status === "inserted")).toHaveLength(2);
    expect(map.filter((row) => row.status === "inserted").every((row) => row.uniprotPosition === null)).toBe(
      true,
    );
    const minifiedPositions = map
      .map((row) => row.minifiedPosition)
      .filter((pos): pos is number => pos !== null);
    expect(minifiedPositions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("annotation overlap", () => {
  it("detects inclusive overlap", () => {
    const features = [
      { id: "d1", type: "domain" as const, start: 10, end: 20, description: "SH3" },
    ];
    expect(overlappingFeatures({ start: 18, end: 25 }, features)).toHaveLength(1);
    expect(overlappingFeatures({ start: 21, end: 25 }, features)).toHaveLength(0);
  });
});

describe("drag clamp", () => {
  it("keeps at least one retained residue between deletions", () => {
    const clamped = clampDeletionBounds(
      { start: 20, end: 40 },
      { start: 1, end: 100 },
      [{ start: 10, end: 19 }],
    );
    expect(clamped.start).toBeGreaterThanOrEqual(21);
  });

  it("merges ranges that abut or overlap", () => {
    const abut = coalesceTouchingDeletions({ start: 20, end: 40 }, [
      { id: "a", start: 41, end: 60 },
    ]);
    expect(abut.span).toEqual({ start: 20, end: 60 });
    expect(abut.absorbedIds).toEqual(["a"]);
    const overlap = coalesceTouchingDeletions({ start: 20, end: 45 }, [
      { id: "b", start: 40, end: 70 },
    ]);
    expect(overlap.span).toEqual({ start: 20, end: 70 });
    const gap = coalesceTouchingDeletions({ start: 20, end: 40 }, [
      { id: "c", start: 42, end: 60 },
    ]);
    expect(gap.absorbedIds).toEqual([]);
    expect(gap.span).toEqual({ start: 20, end: 40 });
  });
});

describe("consecutive domain constructs", () => {
  it("spans intervening domains when two non-adjacent domains are selected", () => {
    const protein: ProteinRecord = {
      accession: "P00519",
      entryName: "ABL1_HUMAN",
      organismName: "Homo sapiens",
      sequence: "A".repeat(500),
      length: 500,
      features: [
        { id: "sh3", type: "domain", start: 61, end: 121, description: "SH3" },
        { id: "sh2", type: "domain", start: 127, end: 217, description: "SH2" },
        { id: "kinase", type: "domain", start: 242, end: 493, description: "Kinase" },
      ],
    };
    const construct = constructFromDomainIds(protein, ["sh3", "sh2"]);
    expect(construct.start).toBe(61);
    expect(construct.end).toBe(217);
    expect(construct.featureId).toBe("sh3+sh2");
    expect(construct.label).toContain("SH3");
    expect(construct.label).toContain("SH2");
  });

  it("keeps a domain identity when the range is extended past the annotation", () => {
    const protein: ProteinRecord = {
      accession: "P00519",
      entryName: "ABL1_HUMAN",
      organismName: "Homo sapiens",
      sequence: "A".repeat(500),
      length: 500,
      features: [
        { id: "sh3", type: "domain", start: 61, end: 121, description: "SH3" },
      ],
    };
    const previous = constructFromDomainIds(protein, ["sh3"]);
    const extended = constructFromRange(protein, 50, 130, previous);
    expect(extended.start).toBe(50);
    expect(extended.end).toBe(130);
    expect(extended.featureId).toBe("sh3");
  });

  it("defaults to the unique UniProt chain annotation", () => {
    const protein: ProteinRecord = {
      accession: "P05067",
      entryName: "A4_HUMAN",
      organismName: "Homo sapiens",
      sequence: "A".repeat(770),
      length: 770,
      features: [
        { id: "sig", type: "signal", start: 1, end: 17, description: "Signal" },
        { id: "chain", type: "chain", start: 18, end: 770, description: "Amyloid-beta precursor protein" },
        { id: "pep", type: "peptide", start: 672, end: 713, description: "Amyloid-beta peptide" },
        { id: "sh3", type: "domain", start: 61, end: 121, description: "SH3" },
      ],
    };
    const construct = initialConstruct(protein);
    expect(construct.start).toBe(18);
    expect(construct.end).toBe(770);
    expect(construct.featureId).toBe("chain");
    expect(construct.label).toBe("Chain: Amyloid-beta precursor protein (18–770)");
  });

  it("omits a unique chain that is identical to full length", () => {
    const protein: ProteinRecord = {
      accession: "P00519",
      entryName: "ABL1_HUMAN",
      organismName: "Homo sapiens",
      sequence: "A".repeat(1130),
      length: 1130,
      features: [
        { id: "chain", type: "chain", start: 1, end: 1130, description: "Tyrosine-protein kinase ABL1" },
        { id: "sh3", type: "domain", start: 61, end: 121, description: "SH3" },
      ],
    };
    expect(initialConstruct(protein).kind).toBe("full_length");
    expect(selectableFeatures(protein).map((feature) => feature.type)).toEqual(["domain"]);
  });

  it("keeps full length when more than one chain is annotated", () => {
    const protein: ProteinRecord = {
      accession: "P00000",
      entryName: "TEST_HUMAN",
      organismName: "Homo sapiens",
      sequence: "A".repeat(100),
      length: 100,
      features: [
        { id: "c1", type: "chain", start: 1, end: 40, description: "Chain 1" },
        { id: "c2", type: "chain", start: 41, end: 100, description: "Chain 2" },
      ],
    };
    expect(initialConstruct(protein).kind).toBe("full_length");
  });
});

