import { useEffect, useState } from "react";
import { WINDOW_SIZE } from "../domain/types";
import { useWorkspaceStore } from "../state/workspaceStore";

export function AdvancedSettings({ alwaysOpen = false }: { alwaysOpen?: boolean }) {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const applySettings = useWorkspaceStore((state) => state.applySettings);
  const [open, setOpen] = useState(alwaysOpen);
  const [threshold, setThreshold] = useState(50);
  const [minLength, setMinLength] = useState(30);
  const [minTerminal, setMinTerminal] = useState(15);

  useEffect(() => {
    if (workspace.status !== "ready") return;
    setThreshold(workspace.settings.plddtThreshold);
    setMinLength(workspace.settings.minimumCandidateLength);
    setMinTerminal(workspace.settings.minimumTerminalCandidateLength);
  }, [workspace]);

  if (workspace.status !== "ready") return null;

  const commit = () => {
    applySettings({
      plddtThreshold: threshold,
      minimumCandidateLength: minLength,
      minimumTerminalCandidateLength: minTerminal,
      windowSize: WINDOW_SIZE,
    });
  };

  const fields = (
    <>
      <label>
        pLDDT threshold
        <input
          type="number"
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
        />
      </label>
      <label>
        Minimum internal length
        <input
          type="number"
          value={minLength}
          onChange={(event) => setMinLength(Number(event.target.value))}
        />
      </label>
      <label>
        Minimum terminal length
        <input
          type="number"
          value={minTerminal}
          onChange={(event) => setMinTerminal(Number(event.target.value))}
        />
      </label>
      <label>
        Smoothing window
        <input value={`${WINDOW_SIZE} residues`} disabled readOnly />
      </label>
      <button type="button" className="primary" onClick={commit}>
        Rerun analysis
      </button>
    </>
  );

  if (alwaysOpen) return <div className="advanced">{fields}</div>;

  return (
    <details className="advanced" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Advanced</summary>
      {fields}
    </details>
  );
}
