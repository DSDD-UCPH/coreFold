import { automaticProposalEdits, buildCandidates } from "../domain";
import { derive } from "./workspaceStore";
import type { ProteinRecord, StructureRecord } from "../domain";

function makeProtein(length: number): ProteinRecord {
  return {
    accession: "P00519",
    entryName: "ABL1_HUMAN",
    organismName: "Homo sapiens",
    sequence: "A".repeat(length),
    length,
    features: [
      { id: "d1", type: "domain", start: 61, end: 121, description: "SH3" },
    ],
  };
}

describe("proposal engine coalescing", () => {
  it("auto-applies terminal deletions and leaves beneficial internals pending", () => {
    const length = 200;
    const plddt = Array.from({ length }, () => 90);
    for (let i = 0; i < 40; i += 1) plddt[i] = 10;
    for (let i = 79; i < 150; i += 1) plddt[i] = 10;
    const ca = Array.from({ length }, () => ({ x: 0, y: 0, z: 0 }));
    const structure: StructureRecord = {
      source: "alphafold_db",
      entryId: "AF-P00519-F1",
      coordinateUrl: "https://alphafold.ebi.ac.uk/files/AF-P00519-F1-model_v6.cif",
      mmcifText: "",
      plddt,
      ca,
    };
    const protein = makeProtein(length);
    const construct = { start: 1, end: length };
    const candidates = buildCandidates(protein, structure, construct);
    expect(candidates.some((candidate) => candidate.class === "n_terminal")).toBe(true);
    expect(candidates.some((candidate) => candidate.class === "internal")).toBe(true);
    const edits = automaticProposalEdits(candidates);
    expect(edits.filter((edit) => edit.type === "deletion" && edit.status === "applied")).toHaveLength(1);
    expect(edits.filter((edit) => edit.type === "replacement" && edit.status === "pending").length).toBeGreaterThan(0);

    const accepted = edits.map((edit) =>
      edit.status === "pending" ? { ...edit, status: "applied" as const } : edit,
    );
    const derived = derive(
      protein,
      { kind: "full_length", start: 1, end: length, label: "Full length" },
      accepted,
      candidates,
      false,
    );
    expect(derived.minifiedLength).toBeLessThan(derived.originalLength);
    expect(derived.throughputGain).toBeGreaterThan(1);
  });

  it("reports throughput below 1× when a domain window is longer than the annotated domain", () => {
    const protein = makeProtein(200);
    const derived = derive(
      protein,
      { kind: "domain", featureId: "d1", start: 50, end: 130, label: "SH3 (61–121)" },
      [],
      [],
      false,
    );
    expect(derived.referenceLength).toBe(61);
    expect(derived.minifiedLength).toBe(81);
    expect(derived.throughputGain).toBeLessThan(1);
  });
});
