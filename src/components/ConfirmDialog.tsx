import { useWorkspaceStore, type PendingAction } from "../state/workspaceStore";

export function ConfirmDialog() {
  const pending = useWorkspaceStore((state) => state.pendingAction);
  const confirm = useWorkspaceStore((state) => state.confirmPendingAction);
  const cancel = useWorkspaceStore((state) => state.cancelPendingAction);
  if (!pending) return null;
  const copy = pendingCopy(pending);
  return (
    <div className="modal-backdrop" role="presentation" onClick={cancel}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="confirm-title">
          <strong>{copy.title}</strong>
        </p>
        <p id="confirm-body">{copy.body}</p>
        <div className="row">
          <button type="button" className="ghost" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={confirm}>
            {copy.action}
          </button>
        </div>
      </div>
    </div>
  );
}

function pendingCopy(action: PendingAction): { title: string; body: string; action: string } {
  if (action.type === "load") {
    return {
      title: "Load a new protein?",
      body: "This will replace the current design.",
      action: "Load new protein",
    };
  }
  if (action.type === "history") {
    return {
      title: "Restore this design?",
      body: "The current design will be replaced.",
      action: "Restore",
    };
  }
  if (action.type === "reset") {
    return {
      title: "Reset this protein?",
      body: "Reset to the automatic full-length proposal. Current edits will be discarded.",
      action: "Reset",
    };
  }
  if (action.type === "home") {
    return {
      title: "Return to the start page?",
      body: "Current minification edits will be discarded.",
      action: "Return",
    };
  }
  if (action.type === "settings") {
    return {
      title: "Change analysis settings?",
      body: "Changing analysis settings will reset edits and generate a new automatic proposal.",
      action: "Reset and rerun",
    };
  }
  return {
    title: "Change the active construct?",
    body: "Changing the active construct will reset the current minification edits and generate a new automatic proposal. Continue?",
    action: "Reset and switch",
  };
}
