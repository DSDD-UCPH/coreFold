import { useState } from "react";
import { currentShareUrl, useWorkspaceStore } from "../state/workspaceStore";
import { copyText } from "./utils";

export function StatusBar() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const [copied, setCopied] = useState<"greenfold" | "share" | null>(null);
  if (workspace.status !== "ready") return null;
  const value = workspace.derived.greenfold;
  return (
    <footer className="status-bar">
      <span>GreenFold</span>
      <input readOnly value={value} aria-label="GreenFold construct" />
      <button
        type="button"
        className="ghost"
        onClick={async () => {
          await copyText(value);
          setCopied("greenfold");
          setTimeout(() => setCopied(null), 1200);
        }}
      >
        {copied === "greenfold" ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        className="ghost"
        onClick={async () => {
          await copyText(currentShareUrl(window.location.origin, value));
          setCopied("share");
          setTimeout(() => setCopied(null), 1200);
        }}
      >
        {copied === "share" ? "Copied share link" : "Copy share link"}
      </button>
    </footer>
  );
}
