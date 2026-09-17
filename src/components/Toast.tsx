import { useEffect } from "react";
import { useInteractionStore } from "../state/interactionStore";
import { useWorkspaceStore } from "../state/workspaceStore";

export function Toast() {
  const toast = useInteractionStore((state) => state.toast);
  const setToast = useInteractionStore((state) => state.setToast);
  const undo = useWorkspaceStore((state) => state.undo);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 4000);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{toast.text}</span>
      <button
        type="button"
        onClick={() => {
          undo();
          setToast(undefined);
        }}
      >
        Undo
      </button>
    </div>
  );
}
