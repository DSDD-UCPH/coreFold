import { useState } from "react";
import { useWorkspaceStore } from "../state/workspaceStore";
import { copyText } from "./utils";

export function GreenFoldBar() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const [copied, setCopied] = useState(false);
  if (workspace.status !== "ready") return null;
  const value = workspace.derived.greenfold;
  return (
    <section className="greenfold-bar">
      <span>GreenFold construct</span>
      <input readOnly value={value} aria-label="GreenFold construct" />
      <button
        type="button"
        onClick={async () => {
          await copyText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </section>
  );
}
