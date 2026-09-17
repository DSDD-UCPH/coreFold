import { useEffect } from "react";
import { useWorkspaceStore } from "../state/workspaceStore";

export function UnloadGuard() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const hasUserEdits = useWorkspaceStore((state) => state.hasUserEdits);
  const dirty = workspace.status === "ready" && hasUserEdits();

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return null;
}
