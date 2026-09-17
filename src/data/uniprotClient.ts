import { z } from "zod";
import { HUMAN_TAXONOMY_ID, type ProteinRecord, type UniProtFeature, type UniProtFeatureType } from "../domain/types";
import { DataError } from "./errors";
import { parseIdentifier } from "./identifiers";
import { fetchWithTimeout, singleFlight, withTransientRetry } from "./throttle";
import type { KeyValueCache } from "./cache";

const UNIPROT = "https://rest.uniprot.org";

export type AmbiguityCandidate = {
  accession: string;
  entryName: string;
  gene?: string;
  organismName: string;
  proteinName?: string;
  length: number;
};

export type ResolveResult =
  | { status: "resolved"; accession: string }
  | { status: "ambiguous"; candidates: AmbiguityCandidate[] };

const FeatureSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  location: z
    .object({
      start: z.object({ value: z.number().optional() }).optional(),
      end: z.object({ value: z.number().optional() }).optional(),
    })
    .optional(),
  evidences: z.unknown().optional(),
});

const UniProtRecordSchema = z.object({
  primaryAccession: z.string(),
  uniProtkbId: z.string(),
  organism: z
    .object({
      scientificName: z.string().optional(),
      taxonId: z.number().optional(),
    })
    .optional(),
  genes: z
    .array(z.object({ geneName: z.object({ value: z.string() }).optional() }))
    .optional(),
  proteinDescription: z
    .object({
      recommendedName: z.object({ fullName: z.object({ value: z.string() }).optional() }).optional(),
    })
    .optional(),
  sequence: z.object({
    value: z.string(),
    length: z.number(),
  }),
  features: z.array(FeatureSchema).optional(),
});

const SearchSchema = z.object({
  results: z.array(
    z.object({
      primaryAccession: z.string(),
      uniProtkbId: z.string().optional(),
      organism: z.object({ scientificName: z.string().optional() }).optional(),
      genes: z.array(z.object({ geneName: z.object({ value: z.string() }).optional() })).optional(),
      proteinDescription: z
        .object({
          recommendedName: z.object({ fullName: z.object({ value: z.string() }).optional() }).optional(),
        })
        .optional(),
      sequence: z.object({ length: z.number().optional() }).optional(),
    }),
  ),
});

const FEATURE_MAP: Record<string, UniProtFeatureType> = {
  Domain: "domain",
  Chain: "chain",
  Peptide: "peptide",
  Signal: "signal",
  Region: "region",
  Motif: "motif",
  "Compositional bias": "compositional_bias",
};

export async function resolveProteinQuery(
  query: string,
  cache: KeyValueCache,
): Promise<ResolveResult> {
  const parsed = parseIdentifier(query);
  if (parsed.kind === "accession") {
    return { status: "resolved", accession: parsed.value };
  }
  if (parsed.kind === "entry_name") {
    const accession = await searchExact(
      `id:${parsed.value}`,
      cache,
      `uniprot:search:id:${parsed.value}`,
    );
    return { status: "resolved", accession };
  }
  return searchGene(parsed.value, cache);
}

async function searchGene(symbol: string, cache: KeyValueCache): Promise<ResolveResult> {
  const query = `gene_exact:${symbol} AND organism_id:${HUMAN_TAXONOMY_ID} AND reviewed:true`;
  const json = await uniprotSearch(query, cache, `uniprot:search:gene:${symbol.toUpperCase()}`);
  const candidates: AmbiguityCandidate[] = json.results.map((row) => ({
    accession: row.primaryAccession,
    entryName: row.uniProtkbId ?? row.primaryAccession,
    gene: row.genes?.[0]?.geneName?.value,
    organismName: row.organism?.scientificName ?? "Homo sapiens",
    proteinName: row.proteinDescription?.recommendedName?.fullName?.value,
    length: row.sequence?.length ?? 0,
  }));
  if (candidates.length === 0) {
    throw new DataError("no_uniprot_match", `No reviewed human UniProt entry matches gene symbol ${symbol}.`);
  }
  if (candidates.length === 1) {
    return { status: "resolved", accession: candidates[0].accession };
  }
  return { status: "ambiguous", candidates };
}

async function searchExact(query: string, cache: KeyValueCache, key: string): Promise<string> {
  const json = await uniprotSearch(query, cache, key);
  if (json.results.length === 0) {
    throw new DataError("no_uniprot_match", "No UniProt entry matches that identifier.");
  }
  if (json.results.length > 1) {
    throw new DataError("ambiguous_gene_symbol", "Multiple UniProt entries match that identifier.", json.results);
  }
  return json.results[0].primaryAccession;
}

async function uniprotSearch(query: string, cache: KeyValueCache, cacheKey: string) {
  const cached = await cache.get(cacheKey);
  if (cached) {
    return SearchSchema.parse(JSON.parse(cached));
  }
  const url =
    `${UNIPROT}/uniprotkb/search?query=${encodeURIComponent(query)}` +
    `&fields=accession,id,gene_names,organism_name,protein_name,length&format=json&size=25`;
  const payload = await getJson(url);
  const parsed = SearchSchema.parse(payload);
  await cache.set(cacheKey, JSON.stringify(payload));
  return parsed;
}

export async function fetchProteinRecord(
  accession: string,
  cache: KeyValueCache,
): Promise<ProteinRecord> {
  const cacheKey = `uniprot:${accession}:record:v3`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return normalizeUniProt(JSON.parse(cached));
  }
  const url =
    `${UNIPROT}/uniprotkb/${encodeURIComponent(accession)}.json` +
    `?fields=accession,id,gene_names,organism_name,length,sequence,ft_region,ft_domain,ft_motif,ft_compbias,ft_chain,ft_peptide,ft_signal`;
  const payload = await getJson(url);
  await cache.set(cacheKey, JSON.stringify(payload));
  return normalizeUniProt(payload);
}

export function normalizeUniProt(payload: unknown): ProteinRecord {
  const parsed = UniProtRecordSchema.parse(payload);
  const features: UniProtFeature[] = [];
  for (const [index, feature] of (parsed.features ?? []).entries()) {
    const type = FEATURE_MAP[feature.type];
    if (!type) continue;
    const start = feature.location?.start?.value;
    const end = feature.location?.end?.value;
    if (start == null || end == null) continue;
    features.push({
      id: `${type}-${index}-${start}-${end}`,
      type,
      start,
      end,
      description: feature.description,
      evidence: feature.evidences,
    });
  }
  return {
    accession: parsed.primaryAccession,
    entryName: parsed.uniProtkbId,
    gene: parsed.genes?.[0]?.geneName?.value,
    proteinName: parsed.proteinDescription?.recommendedName?.fullName?.value,
    organismName: parsed.organism?.scientificName ?? "unknown",
    organismId: parsed.organism?.taxonId,
    sequence: parsed.sequence.value,
    length: parsed.sequence.length,
    features,
  };
}

async function getJson(url: string): Promise<unknown> {
  try {
    return await singleFlight(url, () =>
      withTransientRetry(async () => {
        let response: Response;
        try {
          response = await fetchWithTimeout(url);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new DataError("timeout", "The UniProt request timed out. Try again in a moment.");
          }
          throw new DataError("uniprot_unavailable", "UniProt is temporarily unavailable.");
        }
        if (response.status === 404) {
          throw new DataError("no_uniprot_match", "No UniProt entry matches that identifier.");
        }
        if (!response.ok) {
          throw new DataError("uniprot_unavailable", `UniProt returned HTTP ${response.status}.`);
        }
        return response.json();
      }),
    );
  } catch (error) {
    if (error instanceof DataError) throw error;
    throw new DataError("uniprot_unavailable", "UniProt is temporarily unavailable.", error);
  }
}
