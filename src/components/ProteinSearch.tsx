import { useState, type FormEvent } from "react";
import { currentShareUrl, useWorkspaceStore } from "../state/workspaceStore";
import { copyText } from "./utils";

export function ProteinSearch() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const load = useWorkspaceStore((state) => state.load);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void load(query);
  };

  const onShare = async () => {
    if (workspace.status !== "ready") return;
    await copyText(
      currentShareUrl(window.location.origin, workspace.derived.greenfold, window.location.pathname),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <form className="search" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="protein-query">
        Canonical UniProt accession, UniProt entry name, or gene symbol
      </label>
      <input
        id="protein-query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Canonical UniProt accession, UniProt entry name, or gene symbol"
      />
      <button type="submit">Load</button>
      <button type="button" onClick={() => void onShare()} disabled={workspace.status !== "ready"}>
        {copied ? "Copied share link" : "Share"}
      </button>
    </form>
  );
}
