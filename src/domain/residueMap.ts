import { appliedEdits, sortEdits } from "./edits";
import type { Edit, Interval, ResidueMapRow } from "./types";

export function buildResidueMap(
  sequence: string,
  construct: Interval,
  edits: Edit[],
): ResidueMapRow[] {
  const applied = sortEdits(appliedEdits(edits));
  const rows: ResidueMapRow[] = [];
  let cursor = construct.start;
  let minifiedPosition = 1;

  const emitRetained = (from: number, toExclusive: number) => {
    for (let pos = from; pos < toExclusive; pos += 1) {
      const aa = sequence[pos - 1];
      rows.push({
        uniprotPosition: pos,
        uniprotAA: aa,
        status: "retained",
        minifiedPosition,
        minifiedAA: aa,
        editId: null,
      });
      minifiedPosition += 1;
    }
  };

  for (const edit of applied) {
    if (edit.type === "substitution") {
      emitRetained(cursor, edit.position);
      rows.push({
        uniprotPosition: edit.position,
        uniprotAA: edit.fromAA,
        status: "substituted",
        minifiedPosition,
        minifiedAA: edit.toAA,
        editId: edit.id,
      });
      minifiedPosition += 1;
      cursor = edit.position + 1;
      continue;
    }

    if (edit.type === "replacement" && edit.end < edit.start) {
      emitRetained(cursor, edit.start);
      for (const aa of edit.insertedSequence) {
        rows.push({
          uniprotPosition: null,
          uniprotAA: null,
          status: "inserted",
          minifiedPosition,
          minifiedAA: aa,
          editId: edit.id,
        });
        minifiedPosition += 1;
      }
      cursor = edit.start;
      continue;
    }

    emitRetained(cursor, edit.start);
    for (let pos = edit.start; pos <= edit.end; pos += 1) {
      rows.push({
        uniprotPosition: pos,
        uniprotAA: sequence[pos - 1],
        status: "deleted",
        minifiedPosition: null,
        minifiedAA: null,
        editId: edit.id,
      });
    }
    if (edit.type === "replacement") {
      for (const aa of edit.insertedSequence) {
        rows.push({
          uniprotPosition: null,
          uniprotAA: null,
          status: "inserted",
          minifiedPosition,
          minifiedAA: aa,
          editId: edit.id,
        });
        minifiedPosition += 1;
      }
    }
    cursor = edit.end + 1;
  }

  emitRetained(cursor, construct.end + 1);
  return rows;
}

export function removedCanonicalPositions(map: ResidueMapRow[]): number[] {
  return map
    .filter((row) => row.status === "deleted" && row.uniprotPosition !== null)
    .map((row) => row.uniprotPosition as number);
}

export function minifiedSequenceFromMap(map: ResidueMapRow[]): string {
  return map
    .filter((row) => row.minifiedPosition !== null && row.minifiedAA !== null)
    .sort((a, b) => (a.minifiedPosition ?? 0) - (b.minifiedPosition ?? 0))
    .map((row) => row.minifiedAA)
    .join("");
}
