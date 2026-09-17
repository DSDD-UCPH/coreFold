import { intervalLength, type CandidateClass, type Interval } from "./types";

export function classifyCandidate(candidate: Interval, construct: Interval): CandidateClass {
  if (candidate.start === construct.start && candidate.end === construct.end) {
    return "entire_construct";
  }
  if (candidate.start === construct.start) {
    return "n_terminal";
  }
  if (candidate.end === construct.end) {
    return "c_terminal";
  }
  return "internal";
}

export function clampIntervalToConstruct(
  interval: Interval,
  construct: Interval,
): Interval | undefined {
  const start = Math.max(construct.start, Math.min(interval.start, interval.end));
  const end = Math.min(construct.end, Math.max(interval.start, interval.end));
  if (start > end) return undefined;
  return { start, end };
}

export function residueInConstruct(position: number, construct: Interval): boolean {
  return position >= construct.start && position <= construct.end;
}

export function plddtSummary(
  plddt: number[],
  interval: Interval,
): { mean: number; min: number; max: number } {
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let pos = interval.start; pos <= interval.end; pos += 1) {
    const value = plddt[pos - 1];
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { mean: sum / intervalLength(interval), min, max };
}
