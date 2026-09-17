import { appliedEdits, sortEdits } from "../edits";
import type { Construct, Edit, ProteinRecord } from "../types";

export function serializeGreenFold(
  protein: Pick<ProteinRecord, "accession" | "sequence">,
  construct: Construct,
  edits: Edit[],
): string {
  const ops: string[] = [];
  if (construct.kind === "domain") {
    ops.push(`${construct.start}-${construct.end}trunc`);
  }

  const applied = sortEdits(appliedEdits(edits));
  for (const edit of applied) {
    if (edit.type === "substitution") {
      const from = edit.fromAA || protein.sequence[edit.position - 1];
      ops.push(`${from}${edit.position}${edit.toAA}`);
      continue;
    }

    const startAA = protein.sequence[edit.start - 1] ?? "";
    const endAA = protein.sequence[edit.end - 1] ?? "";
    const delToken =
      edit.start === edit.end
        ? `${startAA}${edit.start}del`
        : `${startAA}${edit.start}-${endAA}${edit.end}del`;

    if (edit.type === "deletion") {
      ops.push(delToken);
      continue;
    }

    if (edit.end < edit.start) {
      ops.push(`${edit.start - 1}ins[${edit.insertedSequence}]`);
      continue;
    }

    if (edit.insertedSequence.length === 0) {
      ops.push(delToken);
      continue;
    }

    const after = edit.start - 1;
    ops.push(`${after}ins[${edit.insertedSequence}]`);
    ops.push(delToken);
  }

  if (ops.length === 0) {
    return protein.accession;
  }
  return `${protein.accession}[${ops.join(";")}]`;
}
