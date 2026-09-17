import { reconstructMinifiedSequence } from "../reconstruction";
import {
  parseGreenFold,
  parseShareSearch,
  restoreFromGreenFold,
  serializeGreenFold,
  interpretProteinQuery,
  shareUrl,
} from "./index";
import type { Construct, Edit, ProteinRecord } from "../types";

const protein: Pick<ProteinRecord, "accession" | "sequence" | "entryName"> = {
  accession: "P62736",
  entryName: "ACTA_HUMAN",
  sequence: "A".repeat(377),
};
protein.sequence = `${"A".repeat(19)}F${"A".repeat(357)}`;

describe("GreenFold parser", () => {
  it("parses guide substitution examples", () => {
    expect(parseGreenFold("[F20Y]").ops).toEqual([
      { kind: "sub", position: 20, fromAA: "F", toAA: "Y" },
    ]);
    expect(parseGreenFold("[20Y]").ops).toEqual([
      { kind: "sub", position: 20, fromAA: undefined, toAA: "Y" },
    ]);
    expect(parseGreenFold("P62736[F20Y]").identifier).toBe("P62736");
  });

  it("parses deletions, insertions and truncation", () => {
    expect(parseGreenFold("[12del]").ops[0]).toMatchObject({ kind: "del", start: 12, end: 12 });
    expect(parseGreenFold("[12-13del]").ops[0]).toMatchObject({ kind: "del", start: 12, end: 13 });
    expect(parseGreenFold("[F12-D13del]").ops[0]).toMatchObject({
      kind: "del",
      start: 12,
      end: 13,
      startAA: "F",
      endAA: "D",
    });
    expect(parseGreenFold("[10ins[GGSG]]").ops[0]).toEqual({
      kind: "ins",
      after: 10,
      sequence: "GGSG",
    });
    expect(parseGreenFold("[0ins[GG]]").ops[0]).toEqual({ kind: "ins", after: 0, sequence: "GG" });
    expect(parseGreenFold("[10-11ins[GGSG]]").ops[0]).toEqual({
      kind: "ins",
      after: 10,
      sequence: "GGSG",
    });
    expect(parseGreenFold("[10-200trunc]").ops[0]).toEqual({ kind: "trunc", start: 10, end: 200 });
    expect(parseGreenFold("[10-200]").ops[0]).toEqual({ kind: "trunc", start: 10, end: 200 });
    expect(parseGreenFold("[chain]").ops[0]).toEqual({ kind: "chain" });
  });

  it("parses all three compound separators", () => {
    const expected = [
      { kind: "ins", after: 10, sequence: "GGSG" },
      { kind: "del", start: 12, end: 13, startAA: undefined, endAA: undefined },
      { kind: "sub", position: 20, fromAA: "F", toAA: "Y" },
    ];
    expect(parseGreenFold("[10ins[GGSG];12-13del;F20Y]").ops).toEqual(expected);
    expect(parseGreenFold("[10ins[GGSG],12-13del,F20Y]").ops).toEqual(expected);
    expect(parseGreenFold("[10ins[GGSG]|12-13del|F20Y]").ops).toEqual(expected);
  });

  it("parses multiple truncation ranges", () => {
    expect(parseGreenFold("[10-20trunc;30-49trunc]").ops).toEqual([
      { kind: "trunc", start: 10, end: 20 },
      { kind: "trunc", start: 30, end: 49 },
    ]);
  });
});

describe("GreenFold serialize/restore", () => {
  const construct: Construct = { kind: "full_length", start: 1, end: 377, label: "Full length" };

  it("round-trips a deletion plus insertion replacement", () => {
    const edits: Edit[] = [
      {
        id: "e1",
        type: "replacement",
        source: "user",
        status: "applied",
        start: 12,
        end: 13,
        insertedSequence: "GGSG",
      },
    ];
    const encoded = serializeGreenFold(protein, construct, edits);
    expect(encoded).toBe("P62736[11ins[GGSG];A12-A13del]");
    const restored = restoreFromGreenFold(encoded, protein.sequence.length, protein.accession);
    const original = reconstructMinifiedSequence(protein.sequence, construct, edits);
    const roundTrip = reconstructMinifiedSequence(protein.sequence, restored.construct, restored.edits);
    expect(roundTrip).toBe(original);
  });

  it("emits trunc for a domain construct (A2)", () => {
    const domain: Construct = { kind: "domain", start: 10, end: 200, label: "Domain (10–200)" };
    const edits: Edit[] = [
      {
        id: "e1",
        type: "deletion",
        source: "automatic",
        status: "applied",
        start: 12,
        end: 13,
      },
    ];
    expect(serializeGreenFold(protein, domain, edits)).toBe("P62736[10-200trunc;A12-A13del]");
  });

  it("normalizes a zero-length linker to a bare deletion", () => {
    const edits: Edit[] = [
      {
        id: "e1",
        type: "replacement",
        source: "user",
        status: "applied",
        start: 12,
        end: 13,
        insertedSequence: "",
      },
    ];
    expect(serializeGreenFold(protein, construct, edits)).toBe("P62736[A12-A13del]");
  });

  it("falls back for a foreign trunc union with 1.00× throughput flag", () => {
    const restored = restoreFromGreenFold(
      "P62736[10-20trunc;30-49trunc]",
      protein.sequence.length,
      protein.accession,
    );
    expect(restored.throughputUsesMinifiedAsOriginal).toBe(true);
    expect(restored.construct.start).toBe(10);
    expect(restored.construct.end).toBe(49);
    expect(restored.edits.some((edit) => edit.type === "deletion" && edit.start === 21 && edit.end === 29)).toBe(
      true,
    );
  });

  it("round-trips a terminal deletion plus internal replacement", () => {
    const edits: Edit[] = [
      {
        id: "n",
        type: "deletion",
        source: "automatic",
        status: "applied",
        start: 1,
        end: 49,
      },
      {
        id: "i",
        type: "replacement",
        source: "user",
        status: "applied",
        start: 514,
        end: 1023,
        insertedSequence: "G".repeat(24),
      },
    ];
    const long = {
      accession: "P00519",
      sequence: `${"M"}${"A".repeat(48)}${"X".repeat(464)}${"G"}${"A".repeat(509)}${"A".repeat(107)}`,
    };
    long.sequence = "A".repeat(1130);
    const full = { kind: "full_length" as const, start: 1, end: 1130, label: "Full length" };
    const encoded = serializeGreenFold(long, full, edits);
    const restored = restoreFromGreenFold(encoded, 1130, "P00519");
    expect(restored.edits.some((edit) => edit.type === "deletion" && edit.start === 1 && edit.end === 49)).toBe(
      true,
    );
    const replacement = restored.edits.find((edit) => edit.type === "replacement");
    expect(replacement).toMatchObject({ start: 514, end: 1023, insertedSequence: "G".repeat(24) });
    expect(reconstructMinifiedSequence(long.sequence, restored.construct, restored.edits)).toBe(
      reconstructMinifiedSequence(long.sequence, full, edits),
    );
  });

  it("parses percent-encoded share search values", () => {
    expect(parseShareSearch("?greenfold=P00519%5BM1-N49del%5D")).toBe("P00519[M1-N49del]");
    expect(parseShareSearch("?greenfold=P00519%255BM1-N49del%255D")).toBe("P00519[M1-N49del]");
    const url = shareUrl("https://example.org", "P62736[F20Y]");
    expect(url).toContain("/?greenfold=");
    expect(parseShareSearch(new URL(url).search)).toBe("P62736[F20Y]");
  });

  it("extracts a GreenFold pattern from a typed query or share URL", () => {
    expect(interpretProteinQuery("P00519[M1-N49del]")).toEqual({
      query: "P00519",
      greenfold: "P00519[M1-N49del]",
    });
    expect(interpretProteinQuery("https://example.org/?greenfold=P00519%5BM1-N49del%5D")).toEqual({
      query: "P00519",
      greenfold: "P00519[M1-N49del]",
    });
    expect(interpretProteinQuery("P00519")).toEqual({ query: "P00519" });
  });
});
