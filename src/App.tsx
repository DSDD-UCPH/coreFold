import { useEffect, useState } from "react";
import { APP_NAME } from "./domain";
import { encodeShareSearch, parseShareSearch } from "./domain/greenfold";
import { upsertWorkingDesign } from "./state/designHistory";
import { useWorkspaceStore, type LoadStage } from "./state/workspaceStore";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ConstructSelector } from "./components/ConstructSelector";
import { Header } from "./components/Header";
import { StartPageTips } from "./components/StartPageTips";
import { TipsDialog } from "./components/TipsDialog";
import { BrandMark } from "./components/Brand";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { MetricsPanel } from "./components/MetricsPanel";
import { ProposalPanel } from "./components/ProposalPanel";
import { SequenceViewer } from "./components/SequenceViewer";
import { StatusBar } from "./components/StatusBar";
import { StructureViewer } from "./components/StructureViewer";
import { Toast } from "./components/Toast";
import { UnloadGuard } from "./components/UnloadGuard";
import { WorkspaceLayout } from "./components/WorkspaceLayout";

const LOAD_STAGES: LoadStage[] = [
  "Resolving UniProt entry",
  "Loading canonical sequence and annotations",
  "Loading AlphaFold model",
  "Mapping confidence and coordinates",
  "Generating automatic proposal",
];

export function App() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const load = useWorkspaceStore((state) => state.load);
  const [shareError, setShareError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [tipsOpen, setTipsOpen] = useState(false);
  const openTips = () => setTipsOpen(true);

  useEffect(() => {
    try {
      const pattern = parseShareSearch(window.location.search);
      if (!pattern) return;
      void load(pattern, { force: true });
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Malformed share link.");
    }
  }, [load]);

  const ready = workspace.status === "ready" ? workspace : null;
  const greenfold = ready?.derived.greenfold;

  useEffect(() => {
    if (!greenfold) return;
    try {
      const next = encodeShareSearch(greenfold);
      const url = `${window.location.pathname}${next}`;
      if (`${window.location.pathname}${window.location.search}` === url) return;
      window.history.replaceState(null, "", url);
    } catch {
      // Keep the current URL when the pattern exceeds the share-length limit.
    }
  }, [greenfold]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      upsertWorkingDesign({
        accession: ready.protein.accession,
        gene: ready.protein.gene,
        label: ready.construct.label,
        greenfold: ready.derived.greenfold,
        minifiedLength: ready.derived.minifiedLength,
        gain: ready.derived.throughputLabel,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    ready?.derived.greenfold,
    ready?.construct.label,
    ready?.derived.minifiedLength,
    ready?.derived.throughputLabel,
    ready?.protein.accession,
    ready?.protein.gene,
  ]);

  return (
    <>
      <div className="workspace">
        <Header
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen((open) => !open)}
          onOpenTips={openTips}
        />
        {workspace.status === "ready" && <ConstructSelector />}
        {shareError && <div className="banner error">{shareError}</div>}
        {workspace.status === "empty" && <EmptyState onOpenTips={openTips} />}
        {workspace.status === "loading" && <LoadingState stage={workspace.stage} />}
        {workspace.status === "ambiguous" && <AmbiguityTable />}
        {workspace.status === "error" && <div className="banner error">{workspace.message}</div>}
        {workspace.status === "unsupported" && (
          <section className="banner error">
            <p>{workspace.message}</p>
            <p>Load another protein to continue.</p>
          </section>
        )}
        {ready && (
          <>
            <WorkspaceLayout
              inspectorOpen={inspectorOpen}
              viewer={<StructureViewer />}
              inspector={
                <>
                  <MetricsPanel />
                  <ProposalPanel />
                </>
              }
              sequence={<SequenceViewer />}
            />
            <StatusBar />
          </>
        )}
      </div>
      <Toast />
      <ConfirmDialog />
      {tipsOpen && <TipsDialog onClose={() => setTipsOpen(false)} />}
      <KeyboardShortcuts />
      <UnloadGuard />
    </>
  );
}

function EmptyState({ onOpenTips }: { onOpenTips: () => void }) {
  const load = useWorkspaceStore((state) => state.load);
  const [query, setQuery] = useState("");
  return (
    <section className="empty-state">
      <div className="empty-card">
        <div className="empty-brand">
          <BrandMark className="empty-logo" />
          <div>
            <strong className="empty-name">{APP_NAME}</strong>
            <p className="credit">
              Developed by the{" "}
              <a href="https://dsdd.one" target="_blank" rel="noopener noreferrer">
                Data Science for Drug Design
              </a>{" "}
              research group at the University of Copenhagen.
            </p>
          </div>
        </div>
        <h1>Rational protein minification for scalable co-folding</h1>
        <p>
          Enter a canonical UniProt accession, UniProt entry name, or gene symbol. Gene symbols
          default to human.
        </p>
        <form
          className="empty-search"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query);
          }}
        >
          <label className="sr-only" htmlFor="empty-protein-query">
            Canonical UniProt accession, UniProt entry name, or gene symbol
          </label>
          <input
            id="empty-protein-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Canonical UniProt accession, UniProt entry name, or gene symbol"
          />
          <button type="submit" className="primary">
            Load
          </button>
        </form>
        <p className="muted">Examples</p>
        <div className="example-list">
          {["P35367", "HRH1", "HRH1_HUMAN"].map((example) => (
            <button key={example} type="button" className="chip" onClick={() => void load(example)}>
              {example}
            </button>
          ))}
        </div>
        <StartPageTips onOpenTips={onOpenTips} />
      </div>
    </section>
  );
}

function LoadingState({ stage }: { stage: LoadStage }) {
  const current = LOAD_STAGES.indexOf(stage);
  return (
    <section className="loading-state">
      <div className="loading-card">
        <h2>Loading protein</h2>
        <div className="skeleton" />
        <ul className="stage-list">
          {LOAD_STAGES.map((item, index) => (
            <li
              key={item}
              className={index < current ? "done" : index === current ? "current" : ""}
            >
              {index < current ? "✓ " : index === current ? "… " : "○ "}
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AmbiguityTable() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const chooseCandidate = useWorkspaceStore((state) => state.chooseCandidate);
  if (workspace.status !== "ambiguous") return null;
  return (
    <section className="ambiguity">
      <h2>Multiple reviewed human entries match this gene symbol</h2>
      <p>Choose the canonical record to analyze. coreFold will not guess.</p>
      <table>
        <thead>
          <tr>
            <th>Accession</th>
            <th>Entry</th>
            <th>Gene</th>
            <th>Organism</th>
            <th>Protein</th>
            <th>Length</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {workspace.candidates.map((row) => (
            <tr key={row.accession}>
              <td>{row.accession}</td>
              <td>{row.entryName}</td>
              <td>{row.gene}</td>
              <td>{row.organismName}</td>
              <td>{row.proteinName}</td>
              <td>{row.length}</td>
              <td>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void chooseCandidate(row.accession)}
                >
                  Use this entry
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
