import { editId } from "../types";
import type { Construct, Edit } from "../types";
import { GreenFoldSyntaxError, parseGreenFold, type GreenFoldOp, type ParsedGreenFold } from "./parse";

export type GreenFoldRestore = {
  identifier: string;
  construct: Construct;
  edits: Edit[];
  chainRequested: boolean;
  throughputUsesMinifiedAsOriginal: boolean;
  parsed: ParsedGreenFold;
};

export function restoreFromGreenFold(
  raw: string,
  sequenceLength: number,
  accession: string,
): GreenFoldRestore {
  const parsed = parseGreenFold(raw);
  const identifier = parsed.identifier ?? accession;
  if (parsed.ops.some((op) => op.kind === "chain")) {
    return {
      identifier,
      construct: fullConstruct(sequenceLength),
      edits: [],
      chainRequested: true,
      throughputUsesMinifiedAsOriginal: false,
      parsed,
    };
  }

  const truncs = parsed.ops.filter((op): op is Extract<GreenFoldOp, { kind: "trunc" }> => op.kind === "trunc");
  const other = parsed.ops.filter((op) => op.kind !== "trunc" && op.kind !== "chain");

  let construct: Construct = fullConstruct(sequenceLength);
  let throughputUsesMinifiedAsOriginal = false;

  if (truncs.length === 1) {
    const trunc = truncs[0];
    validateRange(trunc.start, trunc.end, sequenceLength, "trunc");
    construct = {
      kind: "domain",
      start: trunc.start,
      end: trunc.end,
      label: `Restored construct (${trunc.start}–${trunc.end})`,
    };
  } else if (truncs.length > 1) {
    const start = Math.min(...truncs.map((t) => t.start));
    const end = Math.max(...truncs.map((t) => t.end));
    validateRange(start, end, sequenceLength, "trunc");
    construct = {
      kind: "restored_final",
      start,
      end,
      label: `Restored retained ranges (${start}–${end})`,
    };
    throughputUsesMinifiedAsOriginal = true;
    const covered = mergeRanges(truncs.map((t) => ({ start: t.start, end: t.end })));
    const gaps: Edit[] = [];
    let cursor = start;
    for (const range of covered) {
      if (cursor < range.start) {
        gaps.push({
          id: editId("deletion", cursor, range.start - 1),
          type: "deletion",
          source: "share_link",
          status: "applied",
          start: cursor,
          end: range.start - 1,
        });
      }
      cursor = range.end + 1;
    }
    if (cursor <= end) {
      gaps.push({
        id: editId("deletion", cursor, end),
        type: "deletion",
        source: "share_link",
        status: "applied",
        start: cursor,
        end,
      });
    }
    return {
      identifier,
      construct,
      edits: [...gaps, ...opsToEdits(other, sequenceLength)],
      chainRequested: false,
      throughputUsesMinifiedAsOriginal,
      parsed,
    };
  }

  return {
    identifier,
    construct,
    edits: opsToEdits(other, sequenceLength),
    chainRequested: false,
    throughputUsesMinifiedAsOriginal,
    parsed,
  };
}

function fullConstruct(sequenceLength: number): Construct {
  return { kind: "full_length", start: 1, end: sequenceLength, label: "Full length" };
}

function validateRange(start: number, end: number, length: number, label: string): void {
  if (start < 1 || end > length || start > end) {
    throw new GreenFoldSyntaxError(`${label} range [${start}, ${end}] is outside 1–${length}`);
  }
}

function mergeRanges(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  const out = [{ ...ordered[0] }];
  for (let i = 1; i < ordered.length; i += 1) {
    const cur = ordered[i];
    const prev = out[out.length - 1];
    if (cur.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function opsToEdits(ops: GreenFoldOp[], sequenceLength: number): Edit[] {
  const edits: Edit[] = [];
  const consumed = new Set<number>();

  for (const op of ops) {
    if (op.kind === "del") {
      validateRange(op.start, op.end, sequenceLength, "deletion");
      if (alreadyCovered(op.start, op.end, consumed)) continue;
      edits.push({
        id: editId("deletion", op.start, op.end),
        type: "deletion",
        source: "share_link",
        status: "applied",
        start: op.start,
        end: op.end,
      });
      markCovered(op.start, op.end, consumed);
    } else if (op.kind === "sub") {
      if (op.position < 1 || op.position > sequenceLength) {
        throw new GreenFoldSyntaxError(`Substitution position ${op.position} is outside 1–${sequenceLength}`);
      }
      edits.push({
        id: editId("substitution", op.position),
        type: "substitution",
        source: "share_link",
        status: "applied",
        position: op.position,
        fromAA: op.fromAA ?? "X",
        toAA: op.toAA,
      });
    } else if (op.kind === "ins") {
      if (op.after < 0 || op.after > sequenceLength) {
        throw new GreenFoldSyntaxError(`Insertion anchor ${op.after} is outside 0–${sequenceLength}`);
      }
    }
  }

  for (const op of ops) {
    if (op.kind !== "ins" || op.sequence.length === 0) continue;
    const del = edits.find((edit) => edit.type === "deletion" && edit.start === op.after + 1);
    if (del && del.type === "deletion") {
      const replacement = {
        id: editId("replacement", del.start, del.end),
        type: "replacement" as const,
        source: "share_link" as const,
        status: "applied" as const,
        start: del.start,
        end: del.end,
        insertedSequence: op.sequence,
      };
      const idx = edits.indexOf(del);
      edits.splice(idx, 1, replacement);
    } else {
      edits.push({
        id: editId("replacement", op.after + 1, op.after),
        type: "replacement",
        source: "share_link",
        status: "applied",
        start: op.after + 1,
        end: op.after,
        insertedSequence: op.sequence,
      });
    }
  }

  return edits;
}

function alreadyCovered(start: number, end: number, consumed: Set<number>): boolean {
  for (let i = start; i <= end; i += 1) {
    if (consumed.has(i)) return true;
  }
  return false;
}

function markCovered(start: number, end: number, consumed: Set<number>): void {
  for (let i = start; i <= end; i += 1) {
    consumed.add(i);
  }
}
