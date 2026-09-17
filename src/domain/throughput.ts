export function relativeInferenceCost(length: number): number {
  if (length <= 0) {
    throw new Error("length must be positive");
  }
  const u = length / 1024;
  return 1 + 0.18 * (u - 1) + 0.64 * (u ** 2 - 1) + 0.16 * (u ** 3 - 1);
}

export function estimatedThroughputGain(originalLength: number, minifiedLength: number): number {
  if (originalLength <= 0 || minifiedLength <= 0) {
    throw new Error("sequence lengths must be positive");
  }
  return relativeInferenceCost(originalLength) / relativeInferenceCost(minifiedLength);
}

export function formatThroughputGain(gain: number): string {
  return `${gain.toFixed(2)}×`;
}

export function showFullLengthThroughputComparison(construct: { kind: string }): boolean {
  return construct.kind !== "full_length";
}
