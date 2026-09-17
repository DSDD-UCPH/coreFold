import { estimatedThroughputGain } from "./throughput";
import {
  applyBoundaryToEdit,
  automaticProposalEdits,
  referenceConstructLength,
  terminalTrimForEdge,
} from "./proposal";
import type { DeletionEdit, ProteinRecord, ReplacementEdit } from "./types";

describe("applyBoundaryToEdit", () => {
  it("keeps candidateId when a linked deletion is resized", () => {
    const edit: DeletionEdit = {
      id: "edit-deletion-1-40",
      type: "deletion",
      source: "automatic",
      status: "applied",
      start: 1,
      end: 40,
      candidateId: "cand-1-40",
    };
    const next = applyBoundaryToEdit(edit, { start: 1, end: 36 }, "n_terminal", undefined);
    expect(next.candidateId).toBe("cand-1-40");
    expect(next.start).toBe(1);
    expect(next.end).toBe(36);
    expect(next.source).toBe("automatic");
    expect(next.type).toBe("deletion");
  });

  it("keeps candidateId when a terminal deletion becomes an internal replacement", () => {
    const edit: DeletionEdit = {
      id: "edit-deletion-1-40",
      type: "deletion",
      source: "automatic",
      status: "applied",
      start: 1,
      end: 40,
      candidateId: "cand-1-40",
    };
    const next = applyBoundaryToEdit(edit, { start: 10, end: 40 }, "internal", {
      leftAnchor: 9,
      rightAnchor: 41,
      distanceAngstrom: 10,
      minimumLinkerLength: 3,
      recommendedLinkerLength: 4,
      recommendedLinker: "GGGG",
      linkerToDeletionRatio: 4 / 31,
      netReduction: 27,
    });
    expect(next.type).toBe("replacement");
    expect(next.candidateId).toBe("cand-1-40");
    if (next.type === "replacement") {
      expect(next.insertedSequence).toBe("GGGG");
    }
  });

  it("recalculates the linker when an internal replacement is resized", () => {
    const edit: ReplacementEdit = {
      id: "edit-replacement-80-120",
      type: "replacement",
      source: "automatic",
      status: "applied",
      start: 80,
      end: 120,
      insertedSequence: "GGG",
      recommendedSequence: "GGG",
      candidateId: "cand-80-120",
    };
    const next = applyBoundaryToEdit(
      edit,
      { start: 70, end: 130 },
      "internal",
      {
        leftAnchor: 69,
        rightAnchor: 131,
        distanceAngstrom: 18.6,
        minimumLinkerLength: 5,
        recommendedLinkerLength: 7,
        recommendedLinker: "GGGGGGG",
        linkerToDeletionRatio: 7 / 61,
        netReduction: 54,
      },
      { start: 80, end: 120 },
    );
    expect(next.type).toBe("replacement");
    expect(next.source).toBe("user");
    if (next.type === "replacement") {
      expect(next.insertedSequence).toBe("GGGGGGG");
      expect(next.recommendedSequence).toBe("GGGGGGG");
      expect(next.anchorDistanceAngstrom).toBe(18.6);
    }
  });

  it("restores automatic source when bounds match the original proposal", () => {
    const edit: ReplacementEdit = {
      id: "edit-replacement-80-120",
      type: "replacement",
      source: "user",
      status: "applied",
      start: 70,
      end: 130,
      insertedSequence: "GGGGGGG",
      candidateId: "cand-80-120",
    };
    const next = applyBoundaryToEdit(
      edit,
      { start: 80, end: 120 },
      "internal",
      {
        leftAnchor: 79,
        rightAnchor: 121,
        distanceAngstrom: 10,
        minimumLinkerLength: 3,
        recommendedLinkerLength: 4,
        recommendedLinker: "GGGG",
        linkerToDeletionRatio: 4 / 41,
        netReduction: 37,
      },
      { start: 80, end: 120 },
    );
    expect(next.source).toBe("automatic");
    if (next.type === "replacement") {
      expect(next.insertedSequence).toBe("GGGG");
    }
  });

  it("keeps candidateId when a replacement becomes a terminal deletion", () => {
    const edit: ReplacementEdit = {
      id: "edit-replacement-80-120",
      type: "replacement",
      source: "automatic",
      status: "applied",
      start: 80,
      end: 120,
      insertedSequence: "GGG",
      candidateId: "cand-80-120",
    };
    const next = applyBoundaryToEdit(edit, { start: 80, end: 200 }, "c_terminal", undefined);
    expect(next.type).toBe("deletion");
    expect(next.candidateId).toBe("cand-80-120");
    expect(next.source).toBe("automatic");
  });
});

describe("automaticProposalEdits", () => {
  it("stores the candidate id on generated edits", () => {
    const edits = automaticProposalEdits([
      {
        id: "cand-1-20",
        start: 1,
        end: 20,
        length: 20,
        class: "n_terminal",
        meanPlddt: 20,
        minPlddt: 10,
        maxPlddt: 40,
        annotationFeatureIds: [],
        autoRecommendation: "terminal_delete",
      },
    ]);
    expect(edits[0]?.candidateId).toBe("cand-1-20");
  });
});

describe("terminalTrimForEdge", () => {
  it("creates N- and C-terminal deletions for a kept range", () => {
    expect(terminalTrimForEdge({ start: 1, end: 200 }, "start", 15, 200)).toEqual({
      start: 1,
      end: 14,
    });
    expect(terminalTrimForEdge({ start: 1, end: 200 }, "end", 1, 180)).toEqual({
      start: 181,
      end: 200,
    });
    expect(terminalTrimForEdge({ start: 1, end: 200 }, "start", 1, 200)).toBeUndefined();
    expect(terminalTrimForEdge({ start: 1, end: 200 }, "end", 1, 200)).toBeUndefined();
  });

  it("trims relative to a domain construct, not the full protein", () => {
    const domain = { start: 242, end: 493 };
    expect(terminalTrimForEdge(domain, "start", 256, 493)).toEqual({ start: 242, end: 255 });
    expect(terminalTrimForEdge(domain, "end", 242, 480)).toEqual({ start: 481, end: 493 });
    expect(terminalTrimForEdge(domain, "start", 242, 493)).toBeUndefined();
  });
});

describe("referenceConstructLength", () => {
  const protein: ProteinRecord = {
    accession: "P00000",
    entryName: "TEST_HUMAN",
    organismName: "Homo sapiens",
    sequence: "A".repeat(1130),
    length: 1130,
    features: [{ id: "pk", type: "domain", start: 242, end: 493, description: "Protein kinase" }],
  };

  it("keeps the annotated domain length when the window is elongated", () => {
    const domain = {
      kind: "domain" as const,
      featureId: "pk",
      start: 230,
      end: 510,
      label: "Protein kinase (242–493)",
    };
    expect(referenceConstructLength(protein, domain)).toBe(252);
    expect(estimatedThroughputGain(252, 281)).toBeLessThan(1);
  });
});
