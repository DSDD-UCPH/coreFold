import type { ProteinRecord } from "../types";

export function wrapFastaSequence(sequence: string): string {
  return sequence.match(/.{1,60}/g)?.join("\n") ?? "";
}

export function exportFasta(
  protein: Pick<ProteinRecord, "accession" | "entryName">,
  sequence: string,
  editCount: number,
): string {
  const header = `>${protein.accession}|minified|source=${protein.entryName}|length=${sequence.length}|edits=${editCount}`;
  return `${header}\n${wrapFastaSequence(sequence)}\n`;
}

export function formatGreenFoldFasta(greenfold: string, sequence: string): string {
  const id = greenfold.replace(/\s+/g, "");
  return `>${id}\n${wrapFastaSequence(sequence)}\n`;
}
