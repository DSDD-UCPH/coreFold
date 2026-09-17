import { z } from "zod";
import type { ProteinRecord, StructureRecord } from "../domain/types";
import { DataError, NO_ALPHAFOLD_MESSAGE } from "./errors";
import { CIF_URL } from "./identifiers";
import { parseMmcifCaAndPlddt } from "./mmcifParser";
import { fetchWithTimeout, singleFlight, withTransientRetry } from "./throttle";
import type { KeyValueCache } from "./cache";

const EntrySchema = z.object({
  entryId: z.string(),
  uniprotAccession: z.string().optional(),
  uniprotSequence: z.string().optional(),
  uniprotStart: z.number().optional(),
  uniprotEnd: z.number().optional(),
  cifUrl: z.string().optional(),
  pdbUrl: z.string().optional(),
  plddtDocUrl: z.string().optional(),
  isComplex: z.boolean().optional(),
});

export async function fetchAlphaFoldStructure(
  protein: ProteinRecord,
  cache: KeyValueCache,
): Promise<StructureRecord> {
  const metaKey = `alphafold:${protein.accession}:metadata`;
  let payload: unknown;
  const cachedMeta = await cache.get(metaKey);
  if (cachedMeta) {
    payload = JSON.parse(cachedMeta);
  } else {
    payload = await getJson(`https://alphafold.ebi.ac.uk/api/prediction/${protein.accession}`);
    await cache.set(metaKey, JSON.stringify(payload));
  }

  const entries = z.array(EntrySchema).parse(payload);
  const selected = selectCanonicalEntry(entries, protein);
  if (!selected?.cifUrl) {
    throw new DataError("alphafold_unavailable", NO_ALPHAFOLD_MESSAGE);
  }
  if (!CIF_URL.test(selected.cifUrl)) {
    throw new DataError("alphafold_mapping_unsupported", NO_ALPHAFOLD_MESSAGE);
  }

  const coordKey = `alphafold:${selected.entryId}:coordinates`;
  let mmcifText = await cache.get(coordKey);
  if (!mmcifText) {
    mmcifText = await getText(selected.cifUrl);
    await cache.set(coordKey, mmcifText);
  }

  const parsed = parseMmcifCaAndPlddt(mmcifText);
  validateMapping(protein, parsed.plddt, parsed.ca, parsed.sequence);

  return {
    source: "alphafold_db",
    entryId: selected.entryId,
    coordinateUrl: selected.cifUrl,
    mmcifText,
    plddt: parsed.plddt,
    ca: parsed.ca,
  };
}

export function selectCanonicalEntry(
  entries: z.infer<typeof EntrySchema>[],
  protein: ProteinRecord,
): z.infer<typeof EntrySchema> | undefined {
  return entries.find(
    (entry) =>
      entry.uniprotSequence === protein.sequence &&
      entry.uniprotStart === 1 &&
      entry.uniprotEnd === protein.length &&
      entry.isComplex !== true,
  );
}

export function validateMapping(
  protein: ProteinRecord,
  plddt: number[],
  ca: Array<unknown>,
  structureSequence?: string,
): void {
  if (plddt.length !== protein.length || ca.length !== protein.length) {
    throw new DataError(
      "alphafold_mapping_unsupported",
      "The AlphaFold model does not map 1:1 onto the canonical UniProt sequence.",
    );
  }
  if (structureSequence && structureSequence !== protein.sequence) {
    throw new DataError(
      "alphafold_mapping_unsupported",
      "The AlphaFold model sequence does not match the canonical UniProt sequence.",
    );
  }
  if (plddt.some((value) => !Number.isFinite(value))) {
    throw new DataError(
      "alphafold_mapping_unsupported",
      "The AlphaFold model is missing residue-level pLDDT for the canonical sequence.",
    );
  }
}

async function getJson(url: string): Promise<unknown> {
  return singleFlight(url, () =>
    withTransientRetry(async () => {
      const response = await fetchSafe(url);
      return response.json();
    }),
  );
}

async function getText(url: string): Promise<string> {
  return singleFlight(url, () =>
    withTransientRetry(async () => {
      const response = await fetchSafe(url);
      return response.text();
    }),
  );
}

async function fetchSafe(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new DataError("timeout", "The AlphaFold request timed out. Try again in a moment.");
    }
    throw new DataError("alphafold_unavailable", NO_ALPHAFOLD_MESSAGE);
  }
  if (response.status === 404) {
    throw new DataError("alphafold_unavailable", NO_ALPHAFOLD_MESSAGE);
  }
  if (!response.ok) {
    throw new DataError("alphafold_unavailable", `AlphaFold DB returned HTTP ${response.status}.`);
  }
  return response;
}
