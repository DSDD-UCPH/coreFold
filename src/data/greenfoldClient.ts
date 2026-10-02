import { DataError } from "./errors";
import { fetchWithTimeout } from "./throttle";
import {
  a3mFilenameFromDisposition,
  greenfoldA3mMutationPattern,
  greenfoldA3mUrl,
  type GreenFoldA3mKind,
} from "../domain/exporters/greenfoldA3m";

const A3M_TIMEOUT_MS = 10 * 60 * 1000;

export type GreenFoldA3mDownload = {
  blob: Blob;
  filename: string;
};

export async function fetchGreenFoldA3m(input: {
  accession: string;
  greenfold: string;
  kind: GreenFoldA3mKind;
}): Promise<GreenFoldA3mDownload> {
  const mutationPattern = greenfoldA3mMutationPattern(input.greenfold);
  const headers: Record<string, string> = {};
  if (mutationPattern) headers["mutation-pattern"] = mutationPattern;

  try {
    return await requestA3m(
      greenfoldA3mUrl(input.accession, input.kind),
      headers,
      input.accession,
      input.kind,
    );
  } catch (error) {
    throw toA3mError(error);
  }
}

async function requestA3m(
  url: string,
  headers: Record<string, string>,
  accession: string,
  kind: GreenFoldA3mKind,
): Promise<GreenFoldA3mDownload> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { headers }, A3M_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new DataError(
        "timeout",
        "The GreenFold A3M download timed out. Try again in a moment.",
      );
    }
    throw error;
  }

  if (response.status === 401) {
    throw new DataError("greenfold_unavailable", "GreenFold rejected the A3M download.");
  }
  if (response.status === 429 || response.status === 503) {
    throw new DataError(
      "greenfold_unavailable",
      "GreenFold is busy. Try the A3M download again in a moment.",
    );
  }
  if (response.status === 404) {
    throw new DataError(
      "greenfold_unavailable",
      "GreenFold does not have an A3M Multiple Sequence Alignment file for this UniProt entry.",
    );
  }
  if (!response.ok) {
    throw new DataError(
      "greenfold_unavailable",
      `GreenFold returned HTTP ${response.status} for the A3M download.`,
    );
  }
  if (isHtmlResponse(response)) {
    throw new DataError(
      "greenfold_unavailable",
      "Couldn't download the A3M from GreenFold in this browser. Open GreenFold's A3M page and apply the current GreenFold construct as the mutation-pattern header.",
    );
  }

  const buffer = await response.arrayBuffer();
  return {
    blob: new Blob([buffer], {
      type: response.headers.get("content-type") ?? "application/octet-stream",
    }),
    filename: a3mFilenameFromDisposition(
      response.headers.get("content-disposition"),
      accession,
      kind,
    ),
  };
}

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

function toA3mError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  return new DataError(
    "greenfold_unavailable",
    "Couldn't download the A3M from GreenFold in this browser. Open GreenFold's A3M page and apply the current GreenFold construct as the mutation-pattern header.",
    error,
  );
}
