import type { Interval, UniProtFeature } from "./types";

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return Math.max(a.start, b.start) <= Math.min(a.end, b.end);
}

export function overlappingFeatures(interval: Interval, features: UniProtFeature[]): UniProtFeature[] {
  return features.filter((feature) => intervalsOverlap(interval, feature));
}
