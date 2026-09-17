import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { readLayoutPrefs, writeLayoutPrefs } from "../state/layoutPrefs";

export function WorkspaceLayout({
  viewer,
  inspector,
  sequence,
  inspectorOpen,
}: {
  viewer: ReactNode;
  inspector: ReactNode;
  sequence: ReactNode;
  inspectorOpen: boolean;
}) {
  const [layout, setLayout] = useState(readLayoutPrefs);
  const dragging = useRef<"inspector" | "dock" | null>(null);

  useEffect(() => {
    writeLayoutPrefs(layout);
  }, [layout]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      if (dragging.current === "inspector") {
        const width = Math.min(640, Math.max(280, window.innerWidth - event.clientX));
        setLayout((prev) => ({ ...prev, inspectorWidth: width }));
      } else {
        const height = Math.min(640, Math.max(160, window.innerHeight - event.clientY - 36));
        setLayout((prev) => ({ ...prev, dockHeight: height, dockCollapsed: false }));
      }
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div
      className={`body ${layout.dockCollapsed ? "dock-collapsed" : ""}`}
      style={
        {
          "--inspector-width": `${layout.inspectorWidth}px`,
          "--dock-height": layout.dockCollapsed ? "auto" : `${layout.dockHeight}px`,
        } as CSSProperties
      }
    >
      <div className="body-upper">
        {viewer}
        <button
          type="button"
          className="v-split"
          aria-label="Resize inspector"
          onPointerDown={() => {
            dragging.current = "inspector";
          }}
        />
        <aside className={`inspector ${inspectorOpen ? "open" : ""}`}>{inspector}</aside>
      </div>
      <button
        type="button"
        className="h-split"
        aria-label="Resize sequence dock"
        onPointerDown={() => {
          dragging.current = "dock";
        }}
        onDoubleClick={() =>
          setLayout((prev) => ({ ...prev, dockCollapsed: !prev.dockCollapsed }))
        }
      />
      <div className={`sequence-host ${layout.dockCollapsed ? "collapsed" : ""}`}>
        {sequence}
      </div>
    </div>
  );
}

