import { ANGSTROM_PER_RESIDUE, FLEXIBILITY_MULTIPLIER } from "./types";

export function minimumLinkerLength(distanceAngstrom: number): number {
  return Math.ceil(distanceAngstrom / ANGSTROM_PER_RESIDUE);
}

export function recommendedLinkerLength(distanceAngstrom: number): number {
  return Math.ceil(minimumLinkerLength(distanceAngstrom) * FLEXIBILITY_MULTIPLIER);
}

export function recommendedLinker(distanceAngstrom: number): string {
  return "G".repeat(recommendedLinkerLength(distanceAngstrom));
}

export function internalEditIsBeneficial(deletedLength: number, linkerLength: number): boolean {
  return linkerLength < 0.5 * deletedLength;
}

export function isGlycineSerineLinker(sequence: string): boolean {
  return /^[GS]*$/.test(sequence);
}
