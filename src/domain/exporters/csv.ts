import type { ResidueMapRow } from "../types";

const HEADERS = [
  "uniprot_position",
  "uniprot_aa",
  "status",
  "minified_position",
  "minified_aa",
  "edit_id",
] as const;

function cell(value: string | number | null): string {
  return value === null ? "" : String(value);
}

export function exportResidueMapCsv(rows: ResidueMapRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        cell(row.uniprotPosition),
        cell(row.uniprotAA),
        row.status,
        cell(row.minifiedPosition),
        cell(row.minifiedAA),
        cell(row.editId),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
