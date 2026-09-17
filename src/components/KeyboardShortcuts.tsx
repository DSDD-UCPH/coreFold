import { useEffect } from "react";
import { classifyCandidate, clampIntervalToConstruct } from "../domain";
import { useWorkspaceStore } from "../state/workspaceStore";

export function KeyboardShortcuts() {
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const addDeletion = useWorkspaceStore((state) => state.addDeletion);
  const setSelection = useWorkspaceStore((state) => state.setSelection);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      const workspace = useWorkspaceStore.getState().workspace;
      if (workspace.status !== "ready") return;
      if (event.key === "Escape") {
        setSelection(undefined);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && workspace.selection) {
        const scoped = clampIntervalToConstruct(workspace.selection, workspace.construct);
        if (!scoped) return;
        const klass = classifyCandidate(scoped, workspace.construct);
        if (klass !== "entire_construct") {
          event.preventDefault();
          addDeletion(scoped.start, scoped.end);
        }
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!workspace.selection) return;
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -1 : 1;
        const step = event.shiftKey ? 10 : 1;
        const lo = workspace.construct.start;
        const hi = workspace.construct.end;
        if (event.shiftKey) {
          const nextEnd = clamp(workspace.selection.end + delta * step, lo, hi);
          setSelection({
            start: Math.min(workspace.selection.start, nextEnd),
            end: Math.max(workspace.selection.start, nextEnd),
            source: "sequence",
          });
        } else {
          const next = clamp(workspace.selection.start + delta * step, lo, hi);
          setSelection({ start: next, end: next, source: "sequence" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, addDeletion, setSelection]);

  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
