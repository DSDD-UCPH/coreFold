import { useEffect, useState, type FormEvent } from "react";
import {
  ALGORITHM_VERSION,
  currentShareUrl,
  exportBundle,
  useWorkspaceStore,
} from "../state/workspaceStore";
import {
  clearDesignHistory,
  deleteDesign,
  getWorkingDesignId,
  readDesignHistory,
  saveWorkingDesign,
  type DesignHistoryEntry,
} from "../state/designHistory";
import { notifyCommit } from "../state/interactionStore";
import { formatGreenFoldFasta } from "../domain/exporters/fasta";
import { copyText, downloadText } from "./utils";
import { Popover } from "./Popover";
import { AdvancedSettings } from "./AdvancedSettings";
import { CofoldingExportMenu } from "./CofoldingExportMenu";
import { GreenFoldA3mExport } from "./GreenFoldA3mExport";

export function Header({
  inspectorOpen,
  onToggleInspector,
}: {
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}) {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const load = useWorkspaceStore((state) => state.load);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const resetDesign = useWorkspaceStore((state) => state.resetDesign);
  const requestAction = useWorkspaceStore((state) => state.requestAction);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<"export" | "history" | "sequence" | "advanced" | null>(null);
  const [history, setHistory] = useState<DesignHistoryEntry[]>([]);
  const ready = workspace.status === "ready" ? workspace : null;

  useEffect(() => {
    if (menu === "history") setHistory(readDesignHistory());
  }, [menu]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void load(query);
  };

  const title = ready
    ? `${ready.protein.gene ?? ready.protein.entryName} / ${ready.protein.accession}`
    : "Protein Minifier";

  return (
    <header className="topbar">
      <div className="brand">
        <strong>Protein Minifier</strong>
        <span className="muted">{ALGORITHM_VERSION}</span>
      </div>
      {ready && (
        <div className="identity-inline">
          <strong>{title}</strong>
          <span className="muted">{ready.protein.organismName}</span>
        </div>
      )}
      {workspace.status !== "empty" && (
        <form className="search" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="protein-query">
            Protein query
          </label>
          <input
            id="protein-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="UniProt, entry name, or gene"
          />
          <button type="submit" className="primary">
            Load
          </button>
        </form>
      )}
      <div className="topbar-actions">
        <button
          type="button"
          className="icon"
          aria-label="Toggle proposal panel"
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
        >
          ≡
        </button>
        <button
          type="button"
          className="ghost"
          onClick={undo}
          disabled={!ready || ready.past.length === 0}
        >
          Undo
        </button>
        <button
          type="button"
          className="ghost"
          onClick={redo}
          disabled={!ready || ready.future.length === 0}
        >
          Redo
        </button>
        <button type="button" className="ghost" onClick={() => resetDesign()} disabled={!ready}>
          Reset
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!ready}
          onClick={() => {
            if (!ready) return;
            saveWorkingDesign({
              accession: ready.protein.accession,
              gene: ready.protein.gene,
              label: ready.construct.label,
              greenfold: ready.derived.greenfold,
              minifiedLength: ready.derived.minifiedLength,
              gain: ready.derived.throughputLabel,
            });
            notifyCommit("Saved to history");
            setHistory(readDesignHistory());
          }}
        >
          Save
        </button>
        <div className="menu-wrap">
          <button
            type="button"
            className="ghost"
            aria-expanded={menu === "history"}
            onClick={() => setMenu(menu === "history" ? null : "history")}
          >
            History
          </button>
          <Popover open={menu === "history"} onClose={() => setMenu(null)}>
            {history.length === 0 && <p className="muted">No designs yet.</p>}
            <ul className="menu-list">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="history-item"
                    onClick={() => {
                      requestAction({
                        type: "history",
                        query: entry.accession,
                        greenfold: entry.greenfold,
                      });
                      setMenu(null);
                    }}
                  >
                    <strong>
                      {entry.gene ?? entry.accession} · {entry.label}
                      {entry.id === getWorkingDesignId() ? " (current)" : ""}
                    </strong>
                    <small>
                      {entry.minifiedLength} aa · {entry.gain} ·{" "}
                      {new Date(entry.savedAt).toLocaleString()}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setHistory(deleteDesign(entry.id))}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            {history.length > 0 && (
              <button
                type="button"
                className="ghost"
                onClick={() => setHistory(clearDesignHistory())}
              >
                Clear history
              </button>
            )}
          </Popover>
        </div>
        <div className="menu-wrap">
          <button
            type="button"
            className="ghost"
            disabled={!ready}
            aria-expanded={menu === "export"}
            onClick={() => setMenu(menu === "export" ? null : "export")}
          >
            Export
          </button>
          {ready && (
            <Popover open={menu === "export"} onClose={() => setMenu(null)}>
              <ExportMenu />
            </Popover>
          )}
        </div>
        <div className="menu-wrap">
          <button
            type="button"
            className="ghost"
            disabled={!ready}
            aria-expanded={menu === "sequence"}
            onClick={() => setMenu(menu === "sequence" ? null : "sequence")}
          >
            Final sequence
          </button>
          {ready && (
            <Popover open={menu === "sequence"} onClose={() => setMenu(null)}>
              <p className="muted">Current minified construct</p>
              <pre className="final-sequence">
                {formatGreenFoldFasta(ready.derived.greenfold, ready.derived.minifiedSequence)}
              </pre>
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    formatGreenFoldFasta(ready.derived.greenfold, ready.derived.minifiedSequence),
                  )
                }
              >
                Copy FASTA
              </button>
            </Popover>
          )}
        </div>
        <div className="menu-wrap">
          <button
            type="button"
            className="ghost"
            disabled={!ready}
            aria-expanded={menu === "advanced"}
            onClick={() => setMenu(menu === "advanced" ? null : "advanced")}
          >
            Advanced
          </button>
          <Popover open={menu === "advanced"} onClose={() => setMenu(null)}>
            <AdvancedSettings alwaysOpen />
          </Popover>
        </div>
      </div>
    </header>
  );
}

function ExportMenu() {
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
    <div className="menu-list">
      <button
        type="button"
        className="ghost"
        onClick={() =>
          downloadText(`${protein.accession}_minified.fasta`, files.fasta, "text/plain")
        }
      >
        Download FASTA
      </button>
      <button
        type="button"
        className="ghost"
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
        className="ghost"
        onClick={() => void copyWithFeedback("sequence", derived.minifiedSequence)}
      >
        {copied === "sequence" ? "Copied sequence" : "Copy sequence"}
      </button>
      <button
        type="button"
        className="ghost"
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
    </div>
  );
}
