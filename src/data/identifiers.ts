export const ACCESSION_6 = /^[A-NR-ZOPQ][0-9][A-Z0-9]{3}[0-9]$/;
export const ACCESSION_10 = /^[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9][A-Z][A-Z0-9]{2}[0-9]$/;
export const ENTRY_NAME = /^[A-Z0-9]{1,10}_[A-Z0-9]{1,5}$/;
export const GENE_SYMBOL = /^[A-Za-z][A-Za-z0-9-]{0,19}$/;
export const ISOFORM_SUFFIX = /^([A-NR-ZOPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9][A-Z][A-Z0-9]{2}[0-9])-\d+$/;

export type IdentifierKind = "accession" | "entry_name" | "gene_symbol";

export type ParsedIdentifier = {
  kind: IdentifierKind;
  value: string;
  isoformInput: boolean;
};

export function parseIdentifier(raw: string): ParsedIdentifier {
  const value = raw.trim();
  if (!value) {
    throw new Error("Enter a UniProt accession, entry name, or gene symbol.");
  }
  const isoform = value.toUpperCase().match(ISOFORM_SUFFIX);
  if (isoform) {
    return { kind: "accession", value: isoform[1], isoformInput: true };
  }
  const upper = value.toUpperCase();
  if (ACCESSION_6.test(upper) || ACCESSION_10.test(upper)) {
    return { kind: "accession", value: upper, isoformInput: false };
  }
  if (ENTRY_NAME.test(upper)) {
    return { kind: "entry_name", value: upper, isoformInput: false };
  }
  if (GENE_SYMBOL.test(value)) {
    return { kind: "gene_symbol", value, isoformInput: false };
  }
  throw new Error("That identifier is not a supported UniProt accession, entry name, or gene symbol.");
}

export const CIF_URL = /^https:\/\/alphafold\.ebi\.ac\.uk\/files\/[A-Za-z0-9._-]+\.cif$/;
