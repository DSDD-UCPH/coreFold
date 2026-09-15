export type DataErrorCode =
  | "invalid_identifier"
  | "no_uniprot_match"
  | "ambiguous_gene_symbol"
  | "uniprot_unavailable"
  | "alphafold_unavailable"
  | "alphafold_mapping_unsupported"
  | "malformed_greenfold"
  | "greenfold_unavailable"
  | "timeout"
  | "internal";

export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly details?: unknown;

  constructor(code: DataErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DataError";
    this.code = code;
    this.details = details;
  }
}

export const NO_ALPHAFOLD_MESSAGE =
  "No usable AlphaFold DB model is available for this canonical UniProt entry. Protein minification requires residue-level pLDDT and structural coordinates, so this entry cannot currently be analyzed.";
