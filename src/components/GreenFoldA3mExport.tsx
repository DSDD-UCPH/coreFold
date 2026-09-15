import { useState } from "react";
import type { ProteinRecord } from "../domain/types";
import {
  GREENFOLD_A3M_ATTRIBUTION,
  greenfoldDownloadMsaUrl,
  isHumanProtein,
  type GreenFoldA3mKind,
} from "../domain/exporters/greenfoldA3m";
import { DataError } from "../data/errors";
import { fetchGreenFoldA3m } from "../data/greenfoldClient";
import { downloadBlob } from "./utils";

export function GreenFoldA3mExport({
  protein,
  greenfold,
}: {
  protein: ProteinRecord;
  greenfold: string;
}) {
  const [busy, setBusy] = useState<GreenFoldA3mKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isHumanProtein(protein)) return null;

  const download = async (kind: GreenFoldA3mKind) => {
    setError(null);
    setBusy(kind);
    try {
      const file = await fetchGreenFoldA3m({
        accession: protein.accession,
        greenfold,
        kind,
      });
      downloadBlob(file.filename, file.blob);
    } catch (caught) {
      const message =
        caught instanceof DataError
          ? caught.message
          : "Couldn't download the A3M from GreenFold in this browser.";
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="export-group">
      <summary>GreenFold A3M</summary>
      <p className="muted">{GREENFOLD_A3M_ATTRIBUTION}</p>
      <div className="menu-list" role="group" aria-label="GreenFold A3M downloads">
        <button
          type="button"
          className="ghost"
          disabled={busy !== null}
          onClick={() => void download("paired")}
        >
          {busy === "paired" ? "Downloading…" : "Download paired A3M"}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy !== null}
          onClick={() => void download("unpaired")}
        >
          {busy === "unpaired" ? "Downloading…" : "Download unpaired A3M"}
        </button>
      </div>
      {error && (
        <p className="muted" role="alert">
          {error}{" "}
          <a
            href={greenfoldDownloadMsaUrl(protein.accession)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open GreenFold A3M download
          </a>
        </p>
      )}
    </details>
  );
}
