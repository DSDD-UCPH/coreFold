import {
  DEFAULT_MIN_CANDIDATE_LENGTH,
  DEFAULT_MIN_TERMINAL_CANDIDATE_LENGTH,
  DEFAULT_PLDDT_THRESHOLD,
  WINDOW_SIZE,
  intervalLength,
  type AnalysisInput,
  type Interval,
} from "./types";
import { classifyCandidate } from "./candidates";

export class AnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisValidationError";
  }
}

export function validateAnalysisInput(input: AnalysisInput): void {
  const { sequence, plddt, ca, constructStart, constructEnd } = input;
  if (sequence.length !== plddt.length) {
    throw new AnalysisValidationError(
      `Sequence length ${sequence.length} does not match pLDDT length ${plddt.length}`,
    );
  }
  const n = sequence.length;
  if (n === 0) {
    throw new AnalysisValidationError("Canonical sequence is empty");
  }
  if (constructStart < 1 || constructEnd > n || constructStart > constructEnd) {
    throw new AnalysisValidationError(
      `Construct bounds [${constructStart}, ${constructEnd}] are outside [1, ${n}]`,
    );
  }
  for (let i = 0; i < plddt.length; i += 1) {
    const value = plddt[i];
    if (!Number.isFinite(value)) {
      throw new AnalysisValidationError(`Non-finite pLDDT at residue ${i + 1}`);
    }
  }
  if (ca && ca.length !== n) {
    throw new AnalysisValidationError(
      `Cα length ${ca.length} does not match canonical length ${n}`,
    );
  }
}

export function detectPositiveWindows(
  plddt: number[],
  constructStart: number,
  constructEnd: number,
  threshold = DEFAULT_PLDDT_THRESHOLD,
): Interval[] {
  const lastStart = constructEnd - WINDOW_SIZE + 1;
  if (lastStart < constructStart) {
    return [];
  }
  const out: Interval[] = [];
  for (let start = constructStart; start <= lastStart; start += 1) {
    const zero = start - 1;
    const endExclusive = zero + WINDOW_SIZE;
    if (endExclusive > plddt.length) {
      throw new AnalysisValidationError(
        `Window [${start}, ${start + WINDOW_SIZE - 1}] exceeds pLDDT length ${plddt.length}`,
      );
    }
    let sum = 0;
    for (let i = zero; i < endExclusive; i += 1) {
      sum += plddt[i];
    }
    const mean = sum / WINDOW_SIZE;
    if (mean < threshold) {
      out.push({ start, end: start + WINDOW_SIZE - 1 });
    }
  }
  return out;
}

export function mergeOverlapping(intervals: Interval[]): Interval[] {
  const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  if (ordered.length === 0) {
    return [];
  }
  const merged: Interval[] = [{ ...ordered[0] }];
  for (let i = 1; i < ordered.length; i += 1) {
    const cur = ordered[i];
    const prev = merged[merged.length - 1];
    if (cur.start <= prev.end) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

export function mergeAbutting(intervals: Interval[]): Interval[] {
  const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  if (ordered.length === 0) {
    return [];
  }
  const merged: Interval[] = [{ ...ordered[0] }];
  for (let i = 1; i < ordered.length; i += 1) {
    const cur = ordered[i];
    const prev = merged[merged.length - 1];
    if (cur.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

export function detectMergedWindows(
  plddt: number[],
  constructStart: number,
  constructEnd: number,
  threshold = DEFAULT_PLDDT_THRESHOLD,
): Interval[] {
  return mergeOverlapping(detectPositiveWindows(plddt, constructStart, constructEnd, threshold));
}

export function minimumLengthForClass(
  klass: ReturnType<typeof classifyCandidate>,
  minimumInternal = DEFAULT_MIN_CANDIDATE_LENGTH,
  minimumTerminal = DEFAULT_MIN_TERMINAL_CANDIDATE_LENGTH,
): number {
  return klass === "internal" ? minimumInternal : minimumTerminal;
}

export function filterByMinimumLength(
  intervals: Interval[],
  construct: Interval,
  minimumInternal = DEFAULT_MIN_CANDIDATE_LENGTH,
  minimumTerminal = DEFAULT_MIN_TERMINAL_CANDIDATE_LENGTH,
): Interval[] {
  return intervals.filter((interval) => {
    const klass = classifyCandidate(interval, construct);
    return intervalLength(interval) >= minimumLengthForClass(klass, minimumInternal, minimumTerminal);
  });
}

export function detectCandidateIntervals(input: AnalysisInput): Interval[] {
  validateAnalysisInput(input);
  const threshold = input.plddtThreshold ?? DEFAULT_PLDDT_THRESHOLD;
  const minInternal = input.minimumCandidateLength ?? DEFAULT_MIN_CANDIDATE_LENGTH;
  const minTerminal = input.minimumTerminalCandidateLength ?? DEFAULT_MIN_TERMINAL_CANDIDATE_LENGTH;
  const construct = { start: input.constructStart, end: input.constructEnd };
  const merged = detectMergedWindows(input.plddt, input.constructStart, input.constructEnd, threshold);
  const filtered = filterByMinimumLength(merged, construct, minInternal, minTerminal);
  return mergeAbutting(filtered);
}
