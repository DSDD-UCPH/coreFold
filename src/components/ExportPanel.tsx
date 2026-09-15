import { useState } from "react";
import { currentShareUrl, exportBundle, useWorkspaceStore } from "../state/workspaceStore";
import { CofoldingExportMenu } from "./CofoldingExportMenu";
import { GreenFoldA3mExport } from "./GreenFoldA3mExport";
import { copyText, downloadText } from "./utils";

export function ExportPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const [copied, setCopied] = useState<"sequence" | "share" | null>(null);
  if (workspace.status !== "ready") return null;
  const { protein, derived } = workspace;
  const files = exportBundle(workspace);
  const copyWithFeedback = async (kind: "sequence" | "share", value: string) => {
    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => {
      setCopied((current) => (current === kind ? null : current));
    }, 1500);
  };

  return (
    <section className="exports">
      <button
        type="button"
        onClick={() =>
          downloadText(`${protein.accession}_minified.fasta`, files.fasta, "text/plain")
        }
      >
        Download FASTA
      </button>
      <button
        type="button"
        onClick={() =>
          downloadText(`${protein.accession}_minified_residue_map.csv`, files.csv, "text/csv")
        }
      >
        Residue map
      </button>
      <GreenFoldA3mExport protein={protein} greenfold={derived.greenfold} />
      <CofoldingExportMenu accession={protein.accession} sequence={derived.minifiedSequence} />
      <button
        type="button"
        onClick={() => void copyWithFeedback("sequence", derived.minifiedSequence)}
      >
        {copied === "sequence" ? "Copied sequence" : "Copy sequence"}
      </button>
      <button
        type="button"
        onClick={() =>
          void copyWithFeedback(
            "share",
            currentShareUrl(window.location.origin, derived.greenfold),
          )
        }
      >
        {copied === "share" ? "Copied share link" : "Copy share link"}
      </button>
      <p className="muted">
        Co-folding inputs contain the minified protein as a single chain. Add interaction partners
        or other entities required for your experiment.
      </p>
    </section>
  );
}
