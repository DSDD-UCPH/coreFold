import { HUMAN_TAXONOMY_ID, type ProteinRecord } from "../types";

export const GREENFOLD_BASE_URL = "https://greenfold.dsdd.one";
export const GREENFOLD_A3M_PROXY_PREFIX = "/greenfold-api";
export const GREENFOLD_A3M_ATTRIBUTION =
  "GreenFold provided the A3M Multiple Sequence Alignment file.";

export type GreenFoldA3mKind = "paired" | "unpaired";

export function isHumanProtein(
  protein: Pick<ProteinRecord, "organismId" | "organismName" | "entryName">,
): boolean {
  if (protein.organismId != null) return protein.organismId === HUMAN_TAXONOMY_ID;
  if (/^Homo sapiens\b/i.test(protein.organismName.trim())) return true;
  return /_HUMAN$/i.test(protein.entryName);
}

export function greenfoldA3mPath(accession: string, kind: GreenFoldA3mKind): string {
  return `/v1/download_a3m/${encodeURIComponent(accession)}?kind=${kind}`;
}

export function greenfoldA3mUrl(accession: string, kind: GreenFoldA3mKind): string {
  return `${GREENFOLD_BASE_URL}${greenfoldA3mPath(accession, kind)}`;
}

export function greenfoldA3mProxyPath(accession: string, kind: GreenFoldA3mKind): string {
  return `${GREENFOLD_A3M_PROXY_PREFIX}${greenfoldA3mPath(accession, kind)}`;
}

export function greenfoldDownloadMsaUrl(accession: string): string {
  return `${GREENFOLD_BASE_URL}/download-msa?uniprot=${encodeURIComponent(accession)}`;
}

/** Fully qualified GreenFold pattern for the `mutation-pattern` header, or omitted for wild type. */
export function greenfoldA3mMutationPattern(greenfold: string): string | undefined {
  const pattern = greenfold.trim();
  if (!pattern.includes("[")) return undefined;
  return pattern;
}

export function greenfoldA3mFallbackFilename(accession: string, kind: GreenFoldA3mKind): string {
  return `${accession}_${kind}.a3m`;
}

export function a3mFilenameFromDisposition(
  header: string | null | undefined,
  accession: string,
  kind: GreenFoldA3mKind,
): string {
  const fallback = greenfoldA3mFallbackFilename(accession, kind);
  if (!header) return fallback;
  const quoted =
    header.match(/filename\*=(?:UTF-8'')?([^;]+)/i)?.[1] ??
    header.match(/filename="([^"]+)"/i)?.[1];
  const raw = quoted ?? header.match(/filename=([^;]+)/i)?.[1];
  if (!raw) return fallback;
  let name = raw.trim();
  try {
    name = decodeURIComponent(name.replace(/^UTF-8''/i, ""));
  } catch {
    name = name.replace(/^UTF-8''/i, "");
  }
  const base = name.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!base || base.includes("..")) return fallback;
  return base;
}
