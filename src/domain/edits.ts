import { MINIFIED_LENGTH_FLOOR, type Edit, type Interval, type ResidueIndex } from "./types";

export class EditValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditValidationError";
  }
}

export function editSpan(edit: Edit): Interval {
  if (edit.type === "substitution") {
    return { start: edit.position, end: edit.position };
  }
  return { start: edit.start, end: edit.end };
}

export function appliedEdits(edits: Edit[]): Edit[] {
  return edits.filter((edit) => edit.status === "applied");
}

export function sortEdits(edits: Edit[]): Edit[] {
  return [...edits].sort((a, b) => {
    const as = editSpan(a);
    const bs = editSpan(b);
    return as.start - bs.start || as.end - bs.end;
  });
}

export function editsOverlap(a: Edit, b: Edit): boolean {
  const left = editSpan(a);
  const right = editSpan(b);
  return Math.max(left.start, right.start) <= Math.min(left.end, right.end);
}

function deletionLike(edit: Edit): boolean {
  return edit.type === "deletion" || edit.type === "replacement";
}

export function validateAppliedEdits(
  edits: Edit[],
  construct: Interval,
  originalLength: number,
): void {
  const applied = sortEdits(appliedEdits(edits));
  for (const edit of applied) {
    const span = editSpan(edit);
    if (edit.type === "replacement" && edit.end < edit.start) {
      if (edit.start < construct.start || edit.start > construct.end + 1) {
        throw new EditValidationError(`Insertion ${edit.id} is outside construct`);
      }
      continue;
    }
    if (span.start < construct.start || span.end > construct.end) {
      throw new EditValidationError(
        `Edit ${edit.id} [${span.start}, ${span.end}] is outside construct [${construct.start}, ${construct.end}]`,
      );
    }
  }
  for (let i = 0; i < applied.length; i += 1) {
    for (let j = i + 1; j < applied.length; j += 1) {
      if (editsOverlap(applied[i], applied[j])) {
        throw new EditValidationError("Applied edits must not overlap");
      }
    }
  }
  const deletions = applied.filter((edit) => deletionLike(edit) && editSpan(edit).end >= editSpan(edit).start);
  for (let i = 1; i < deletions.length; i += 1) {
    const prev = editSpan(deletions[i - 1]);
    const next = editSpan(deletions[i]);
    if (next.start <= prev.end + 1) {
      throw new EditValidationError(
        "Applied deletions must leave at least one retained residue between them",
      );
    }
  }
  const minified = minifiedLengthAfterEdits(originalLength, applied);
  if (minified < MINIFIED_LENGTH_FLOOR) {
    throw new EditValidationError("Minified construct must retain at least one residue");
  }
}

export function minifiedLengthAfterEdits(originalLength: number, edits: Edit[]): number {
  let length = originalLength;
  for (const edit of appliedEdits(edits)) {
    if (edit.type === "deletion") {
      length -= edit.end - edit.start + 1;
    } else if (edit.type === "replacement") {
      length -= Math.max(0, edit.end - edit.start + 1);
      length += edit.insertedSequence.length;
    }
  }
  return length;
}

export function clipEditsToConstruct(edits: Edit[], construct: Interval): Edit[] {
  const next: Edit[] = [];
  for (const edit of edits) {
    if (edit.type === "substitution") {
      if (edit.position >= construct.start && edit.position <= construct.end) next.push(edit);
      continue;
    }
    if (edit.end < edit.start) {
      if (edit.start >= construct.start && edit.start <= construct.end + 1) next.push(edit);
      continue;
    }
    if (edit.end < construct.start || edit.start > construct.end) continue;
    const start = Math.max(edit.start, construct.start);
    const end = Math.min(edit.end, construct.end);
    if (start > end) continue;
    if (start === construct.start && end === construct.end) continue;
    next.push({ ...edit, start, end });
  }
  return next;
}

export function intervalsTouchOrOverlap(a: Interval, b: Interval): boolean {
  return Math.max(a.start, b.start) <= Math.min(a.end, b.end) + 1;
}

export function coalesceTouchingDeletions(
  proposed: Interval,
  others: Array<Interval & { id: string }>,
): { span: Interval; absorbedIds: string[] } {
  let span = { start: proposed.start, end: proposed.end };
  const absorbed = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const other of others) {
      if (absorbed.has(other.id)) continue;
      if (!intervalsTouchOrOverlap(span, other)) continue;
      span = { start: Math.min(span.start, other.start), end: Math.max(span.end, other.end) };
      absorbed.add(other.id);
      changed = true;
    }
  }
  return { span, absorbedIds: [...absorbed] };
}

export function clampDeletionBounds(
  proposed: Interval,
  construct: Interval,
  otherAppliedDeletions: Interval[],
): Interval {
  let start = Math.max(construct.start, Math.min(proposed.start, proposed.end));
  let end = Math.min(construct.end, Math.max(proposed.start, proposed.end));
  if (start > end) {
    start = construct.start;
    end = construct.start;
  }
  for (const other of otherAppliedDeletions) {
    if (other.end < start) {
      start = Math.max(start, other.end + 2);
    } else if (other.start > end) {
      end = Math.min(end, other.start - 2);
    }
  }
  if (start > end) {
    throw new EditValidationError("Cannot preserve a valid deletion with required retained anchors");
  }
  const remainingBefore = start - construct.start;
  const remainingAfter = construct.end - end;
  if (remainingBefore + remainingAfter < 1) {
    if (start === construct.start && end === construct.end) {
      end = construct.end - 1;
    }
  }
  if (end < start) {
    throw new EditValidationError("Deletion would leave an empty construct");
  }
  return { start, end };
}

export function residueCoveredByAppliedEdit(position: ResidueIndex, edits: Edit[]): Edit | undefined {
  return appliedEdits(edits).find((edit) => {
    const span = editSpan(edit);
    return position >= span.start && position <= span.end;
  });
}
