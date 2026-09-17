import { appliedEdits, sortEdits } from "./edits";
import type { Edit, Interval } from "./types";

export function originalConstructSequence(sequence: string, construct: Interval): string {
  return sequence.slice(construct.start - 1, construct.end);
}

export function reconstructMinifiedSequence(
  sequence: string,
  construct: Interval,
  edits: Edit[],
): string {
  const applied = sortEdits(appliedEdits(edits));
  let cursor = construct.start;
  let out = "";
  for (const edit of applied) {
    if (edit.type === "substitution") {
      out += sequence.slice(cursor - 1, edit.position - 1);
      out += edit.toAA;
      cursor = edit.position + 1;
      continue;
    }
    if (edit.type === "replacement" && edit.end < edit.start) {
      out += sequence.slice(cursor - 1, edit.start - 1);
      out += edit.insertedSequence;
      cursor = edit.start;
      continue;
    }
    out += sequence.slice(cursor - 1, edit.start - 1);
    if (edit.type === "replacement") {
      out += edit.insertedSequence;
    }
    cursor = edit.end + 1;
  }
  out += sequence.slice(cursor - 1, construct.end);
  return out;
}
