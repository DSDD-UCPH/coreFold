import { useEffect, useRef, type ReactNode } from "react";

export function Popover({
  open,
  onClose,
  children,
  align = "end",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      const wrap = ref.current?.parentElement;
      if (wrap?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className="popover" style={{ right: align === "end" ? 0 : "auto", left: align === "start" ? 0 : "auto" }}>
      {children}
    </div>
  );
}
