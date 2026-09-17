import { SHARE_QUERY_MAX_LENGTH, SHARE_QUERY_PARAM } from "../types";
import { GreenFoldSyntaxError, parseGreenFold } from "./parse";

export function encodeShareSearch(greenfold: string): string {
  const encoded = encodeURIComponent(greenfold);
  if (encoded.length > SHARE_QUERY_MAX_LENGTH) {
    throw new GreenFoldSyntaxError("Share pattern exceeds maximum length");
  }
  return `?${SHARE_QUERY_PARAM}=${encoded}`;
}

export function shareUrl(origin: string, greenfold: string, pathname = "/"): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const prefix = `${origin.replace(/\/$/, "")}${path === "/" ? "/" : path}`;
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return `${base}/${encodeShareSearch(greenfold)}`;
}

export function interpretProteinQuery(
  query: string,
  greenfold?: string,
): { query: string; greenfold?: string } {
  if (greenfold) {
    try {
      const parsed = parseGreenFold(greenfold);
      return { query: parsed.identifier ?? query.trim(), greenfold };
    } catch {
      return { query: query.trim(), greenfold };
    }
  }
  const trimmed = query.trim();
  if (!trimmed) return { query: trimmed };
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/?") || trimmed.startsWith("?")) {
    try {
      const url = trimmed.startsWith("http") ? new URL(trimmed) : new URL(trimmed, "https://minifier.invalid");
      const pattern = parseShareSearch(url.search);
      if (pattern) {
        const parsed = parseGreenFold(pattern);
        return { query: parsed.identifier ?? trimmed, greenfold: pattern };
      }
    } catch {
      // Fall through to treating the string as an identifier or GreenFold pattern.
    }
  }
  if (trimmed.includes("[")) {
    try {
      const parsed = parseGreenFold(trimmed);
      if (parsed.identifier) return { query: parsed.identifier, greenfold: trimmed };
    } catch {
      // Fall through to a plain identifier load.
    }
  }
  return { query: trimmed };
}

export function parseShareSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  let value = params.get(SHARE_QUERY_PARAM);
  if (value === null) {
    const raw = search.match(/[?&]greenfold=([^&]*)/)?.[1];
    if (!raw) return null;
    try {
      value = decodeURIComponent(raw);
    } catch {
      value = raw;
    }
  }
  if (value.includes("%5B") || value.includes("%5D") || value.includes("%253")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      // already decoded
    }
  }
  if (value.length > SHARE_QUERY_MAX_LENGTH) {
    throw new GreenFoldSyntaxError("Share pattern exceeds maximum length");
  }
  return value;
}
