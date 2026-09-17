import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { classifyCandidate, clampIntervalToConstruct, residueInConstruct } from "../domain/candidates";
import { computeInternalGeometry } from "../domain/proposal";
import { isGlycineSerineLinker } from "../domain/linkers";
import { FEATURE_TYPE_LABEL, type UniProtFeature } from "../domain/types";
import { useInteractionStore } from "../state/interactionStore";
import { useWorkspaceStore, type ReadyState } from "../state/workspaceStore";
import { plddtColor } from "./utils";
import { PlddtLegend } from "./PlddtLegend";
import { Popover } from "./Popover";

const CELL = 14;
const GRIP = 16;
const GAP = 6;
const BLOCK = 10;

type SeqCell = {
  key: string;
  letter: string;
  canonical: number;
  plddt: number;
};

type Drag =
  | { kind: "construct"; edge: "start" | "end"; start: number; end: number }
  | { kind: "edit"; editId: string; edge: "start" | "end"; start: number; end: number }
  | { kind: "range"; origin: number; moved: boolean; shift: boolean };

type EditSpan = {
  id: string;
  start: number;
  end: number;
  insertion?: string;
  status: string;
  live?: boolean;
};

export function SequenceViewer() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const pendingAction = useWorkspaceStore((state) => state.pendingAction);
  const commitBoundary = useWorkspaceStore((state) => state.commitBoundary);
  const resizeConstruct = useWorkspaceStore((state) => state.resizeConstruct);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const addDeletion = useWorkspaceStore((state) => state.addDeletion);
  const addInsertion = useWorkspaceStore((state) => state.addInsertion);
  const setDragPreview = useInteractionStore((state) => state.setDragPreview);
  const setHoverRange = useInteractionStore((state) => state.setHoverRange);
  const hoverRange = useInteractionStore((state) => state.hoverRange);
  const wrapRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<ReadyState | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [cols, setCols] = useState(50);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  const [linker, setLinker] = useState("");
  const [goTo, setGoTo] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [draftConstruct, setDraftConstruct] = useState<{ start: number; end: number } | null>(null);
  const [draftEdit, setDraftEdit] = useState<{ id: string; start: number; end: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const previewRaf = useRef(0);
  const ready = workspace.status === "ready" ? workspace : null;
  readyRef.current = ready;
  const accession = ready?.protein.accession;
  const selectionSource = ready?.selection?.source;
  const selectionStart = ready?.selection?.start;
  const selectionAt = ready?.selection?.at;

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const measure = () => {
      const width = Math.floor(node.clientWidth - 52);
      const next = Math.max(20, residuesThatFit(width));
      setCols((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [accession]);

  const sequence = ready?.protein.sequence;
  const plddt = ready?.structure.plddt;
  const cells = useMemo(
    () => (ready ? buildCells(ready) : []),
    [accession, sequence, plddt],
  );
  const rows = useMemo(() => chunk(cells, cols), [cells, cols]);

  useEffect(() => {
    if (!ready?.selection || selectionSource === "sequence") return;
    const wrap = wrapRef.current;
    const node = wrap?.querySelector(`[data-canonical="${selectionStart}"]`);
    if (wrap instanceof HTMLElement && node instanceof HTMLElement) {
      scrollWithin(wrap, node);
    }
  }, [selectionSource, selectionStart, ready?.selection?.end, selectionAt]);

  useEffect(() => {
    if (selectionStart === undefined || ready?.selection?.end === undefined) return;
    setRangeStart(String(selectionStart));
    setRangeEnd(String(ready.selection.end));
  }, [selectionStart, ready?.selection?.end]);

  useEffect(() => {
    const publishPreview = (preview: Parameters<typeof setDragPreview>[0]) => {
      if (previewRaf.current) cancelAnimationFrame(previewRaf.current);
      previewRaf.current = requestAnimationFrame(() => {
        previewRaf.current = 0;
        setDragPreview(preview);
      });
    };
    const autoScroll = (clientY: number) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      if (clientY < rect.top + 28) wrap.scrollTop -= 16;
      else if (clientY > rect.bottom - 28) wrap.scrollTop += 16;
    };
    const onMove = (event: PointerEvent) => {
      const current = readyRef.current;
      const drag = dragRef.current;
      if (!current || !drag) return;
      autoScroll(event.clientY);
      const pos = residueAtPoint(event.clientX, event.clientY);
      if (pos === undefined) return;
      const proteinClamped = Math.min(current.protein.length, Math.max(1, pos));
      if (drag.kind === "construct") {
        if (drag.edge === "start") drag.start = Math.min(proteinClamped, drag.end);
        else drag.end = Math.max(proteinClamped, drag.start);
        setDraftConstruct({ start: drag.start, end: drag.end });
        publishPreview({ construct: { start: drag.start, end: drag.end } });
        setReadout({
          x: event.clientX,
          y: event.clientY,
          text: readoutText(drag.start, drag.end, current.construct.start, current.construct.end),
        });
        return;
      }
      const constructClamped = Math.min(
        current.construct.end,
        Math.max(current.construct.start, proteinClamped),
      );
      if (drag.kind === "edit") {
        if (drag.edge === "start") drag.start = Math.min(constructClamped, drag.end);
        else drag.end = Math.max(constructClamped, drag.start);
        setDraftEdit({ id: drag.editId, start: drag.start, end: drag.end });
        setRangeStart(String(drag.start));
        setRangeEnd(String(drag.end));
        publishPreview({ edit: { id: drag.editId, start: drag.start, end: drag.end } });
        const original = current.edits.find((item) => item.id === drag.editId);
        setReadout({
          x: event.clientX,
          y: event.clientY,
          text: readoutText(
            drag.start,
            drag.end,
            original && original.type !== "substitution" ? original.start : drag.start,
            original && original.type !== "substitution" ? original.end : drag.end,
          ),
        });
        return;
      }
      drag.moved = drag.moved || proteinClamped !== drag.origin;
      const edge = constructEdgeForRangeOrigin(drag.origin, current.construct, drag.shift);
      if (edge && drag.moved) {
        const next: Extract<Drag, { kind: "construct" }> = {
          kind: "construct",
          edge,
          start: current.construct.start,
          end: current.construct.end,
        };
        if (edge === "start") next.start = Math.min(proteinClamped, next.end);
        else next.end = Math.max(proteinClamped, next.start);
        dragRef.current = next;
        setSelection(undefined);
        setDraftConstruct({ start: next.start, end: next.end });
        publishPreview({ construct: { start: next.start, end: next.end } });
        setReadout({
          x: event.clientX,
          y: event.clientY,
          text: readoutText(next.start, next.end, current.construct.start, current.construct.end),
        });
        return;
      }
      if (!edge) {
        setSelection({
          start: Math.min(drag.origin, constructClamped),
          end: Math.max(drag.origin, constructClamped),
          source: "sequence",
          at: Date.now(),
        });
      }
    };
    const onUp = () => {
      const current = readyRef.current;
      const drag = dragRef.current;
      dragRef.current = null;
      setReadout(null);
      if (previewRaf.current) cancelAnimationFrame(previewRaf.current);
      previewRaf.current = 0;
      if (!current || !drag) {
        setDraftConstruct(null);
        setDraftEdit(null);
        setDragPreview(undefined);
        return;
      }
      if (drag.kind === "construct") {
        resizeConstruct(drag.start, drag.end, { edge: drag.edge });
        setDraftConstruct(null);
        setDragPreview(undefined);
      } else if (drag.kind === "edit") {
        commitBoundary(drag.editId, drag.start, drag.end);
        setDraftEdit(null);
        setDragPreview(undefined);
      } else {
        if (!drag.moved && !drag.shift) {
          setSelection({
            start: drag.origin,
            end: drag.origin,
            source: "sequence",
            at: Date.now(),
          });
        }
        setDraftConstruct(null);
        setDraftEdit(null);
        setDragPreview(undefined);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [commitBoundary, resizeConstruct, setSelection, setDragPreview]);

  if (!ready) return null;

  const features = ready.protein.features;
  const selection = ready.selection;
  const parsedStart = Number(rangeStart);
  const parsedEnd = Number(rangeEnd);
  const typedRange =
    Number.isInteger(parsedStart) &&
    Number.isInteger(parsedEnd) &&
    parsedStart >= 1 &&
    parsedEnd <= ready.protein.length &&
    parsedStart <= parsedEnd
      ? { start: parsedStart, end: parsedEnd }
      : selection;
  const rangeClass = selection ? classifyCandidate(selection, ready.construct) : undefined;
  const deleteLabel = !selection
    ? "Delete selection"
    : rangeClass === "n_terminal"
      ? "Trim N-terminus"
      : rangeClass === "c_terminal"
        ? "Trim C-terminus"
        : "Delete and add linker";
  const pendingConstruct =
    pendingAction?.type === "construct" ? pendingAction.construct : undefined;
  const viewConstruct = draftConstruct ?? pendingConstruct ?? {
    start: ready.construct.start,
    end: ready.construct.end,
  };
  const editSpans = visibleEdits(ready, draftEdit);
  const canDeleteSelection =
    selection !== undefined &&
    rangeClass !== "entire_construct" &&
    clampIntervalToConstruct(selection, ready.construct) !== undefined &&
    Array.from(
      { length: selection.end - selection.start + 1 },
      (_, i) => selection.start + i,
    ).some((position) => !residueFaded(position, ready.construct, editSpans));

  const onCellDown = (event: ReactPointerEvent<HTMLDivElement>, cell: SeqCell) => {
    event.preventDefault();
    if (residueFaded(cell.canonical, ready.construct, editSpans)) return;
    const origin =
      event.shiftKey && ready.selection
        ? cell.canonical <= ready.selection.start
          ? ready.selection.end
          : ready.selection.start
        : cell.canonical;
    const originClamped = Math.min(
      ready.construct.end,
      Math.max(ready.construct.start, origin),
    );
    const edge = constructEdgeForRangeOrigin(originClamped, ready.construct, event.shiftKey);
    dragRef.current = {
      kind: "range",
      origin: originClamped,
      moved: event.shiftKey,
      shift: event.shiftKey,
    };
    if (edge) return;
    setSelection({
      start: Math.min(originClamped, cell.canonical),
      end: Math.max(originClamped, cell.canonical),
      source: "sequence",
      at: Date.now(),
    });
  };

  const onGripDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    drag: Exclude<Drag, { kind: "range" }>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = drag;
    if (drag.kind === "construct") {
      setSelection(undefined);
      setDraftConstruct({ start: drag.start, end: drag.end });
      setDragPreview({ construct: { start: drag.start, end: drag.end } });
    } else {
      setDraftEdit({ id: drag.editId, start: drag.start, end: drag.end });
      setDragPreview({ edit: { id: drag.editId, start: drag.start, end: drag.end } });
    }
  };

  const onGripKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    drag: Exclude<Drag, { kind: "range" }>,
  ) => {
    const current = ready;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "Escape") {
      setDraftConstruct(null);
      setDraftEdit(null);
      setDragPreview(undefined);
      return;
    }
    if (event.key === "Enter") {
      if (drag.kind === "construct") resizeConstruct(drag.start, drag.end, { edge: drag.edge });
      else commitBoundary(drag.editId, drag.start, drag.end);
      setDraftConstruct(null);
      setDraftEdit(null);
      setDragPreview(undefined);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -step : step;
    if (drag.kind === "construct") {
      const lo = 1;
      const hi = current.protein.length;
      if (drag.edge === "start") drag.start = Math.min(hi, Math.max(lo, drag.start + delta));
      else drag.end = Math.min(hi, Math.max(lo, drag.end + delta));
      if (drag.start > drag.end) {
        const tmp = drag.start;
        drag.start = drag.end;
        drag.end = tmp;
      }
      setDraftConstruct({ start: drag.start, end: drag.end });
      setDragPreview({ construct: { start: drag.start, end: drag.end } });
    } else {
      const lo = current.construct.start;
      const hi = current.construct.end;
      if (drag.edge === "start") drag.start = Math.min(hi, Math.max(lo, drag.start + delta));
      else drag.end = Math.min(hi, Math.max(lo, drag.end + delta));
      if (drag.start > drag.end) {
        const tmp = drag.start;
        drag.start = drag.end;
        drag.end = tmp;
      }
      setDraftEdit({ id: drag.editId, start: drag.start, end: drag.end });
      setDragPreview({ edit: { id: drag.editId, start: drag.start, end: drag.end } });
    }
    dragRef.current = drag;
  };

  const applyTypedRange = () => {
    if (!typedRange) return;
    const scoped = clampIntervalToConstruct(typedRange, ready.construct);
    if (!scoped) return;
    setSelection({
      start: scoped.start,
      end: scoped.end,
      source: "sequence",
      at: Date.now(),
    });
  };

  const jumpTo = (position: number) => {
    const wrap = wrapRef.current;
    const node = wrap?.querySelector(`[data-canonical="${position}"]`);
    if (wrap instanceof HTMLElement && node instanceof HTMLElement) scrollWithin(wrap, node);
    if (!residueInConstruct(position, ready.construct)) return;
    setSelection({ start: position, end: position, source: "focus", at: Date.now() });
  };

  return (
    <section className={`sequence-dock ${collapsed ? "collapsed" : ""}`}>
      <div className="seq-head">
        <h2>Sequence</h2>
        <span className="muted">Drag residues to select · drag caps to resize</span>
        <PlddtLegend />
        <div className="menu-wrap">
          <button type="button" className="ghost" onClick={() => setGoTo((open) => !open)}>
            Go to residue
          </button>
          <Popover open={goTo} onClose={() => setGoTo(false)} align="start">
            <label>
              From
              <input
                type="number"
                inputMode="numeric"
                min={ready.construct.start}
                max={ready.construct.end}
                value={rangeStart}
                aria-label="Selection start residue"
                onChange={(event) => setRangeStart(event.target.value)}
                onBlur={applyTypedRange}
              />
            </label>
            <label>
              To
              <input
                type="number"
                inputMode="numeric"
                min={ready.construct.start}
                max={ready.construct.end}
                value={rangeEnd}
                aria-label="Selection end residue"
                onChange={(event) => setRangeEnd(event.target.value)}
                onBlur={applyTypedRange}
              />
            </label>
            <button type="button" className="primary" onClick={applyTypedRange}>
              Select range
            </button>
          </Popover>
        </div>
        <button type="button" className="ghost" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      <SeqMinimap
        length={ready.protein.length}
        construct={viewConstruct}
        edits={editSpans}
        candidates={ready.candidates}
        onJump={jumpTo}
      />
      <div
        ref={wrapRef}
        className="seq-wrap"
        onPointerMove={(event) => {
          if (dragRef.current) return;
          const pos = residueAtPoint(event.clientX, event.clientY);
          if (pos === undefined) {
            setHover(null);
            setHoverRange(undefined);
            return;
          }
          const aa = ready.protein.sequence[pos - 1];
          const confidence = ready.structure.plddt[pos - 1];
          const annotations = features
            .filter((feature) => pos >= feature.start && pos <= feature.end)
            .map((feature) => feature.description ?? feature.type)
            .join(", ");
          setHover({
            x: event.clientX,
            y: event.clientY,
            text: `${pos} ${aa}  pLDDT ${confidence.toFixed(1)}${annotations ? `  ${annotations}` : ""}`,
          });
          if (pos < viewConstruct.start || pos > viewConstruct.end) {
            setHoverRange(undefined);
            return;
          }
          setHoverRange({ start: pos, end: pos });
        }}
        onPointerLeave={() => {
          setHover(null);
          setHoverRange(undefined);
        }}
        onPointerDown={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest(".seq-cell") || target.closest(".seq-grip")) return;
          setSelection(undefined);
          setHoverRange(undefined);
        }}
      >
        {rows.map((row) => {
          const first = row[0]?.canonical ?? 0;
          const last = row[row.length - 1]?.canonical ?? 0;
          return (
            <SeqRow
              key={`row-${first}`}
              cells={row}
              rowStart={first}
              rowEnd={last}
              construct={viewConstruct}
              edits={editSpans}
              features={features}
              selection={selection}
              hover={hoverRange}
              onCellDown={onCellDown}
              onGripDown={onGripDown}
              onGripKeyDown={onGripKeyDown}
            />
          );
        })}
      </div>
      {selection && (
        <div
          className="seq-action-bar"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span>
            Selected {selection.start}–{selection.end} ({selection.end - selection.start + 1} aa)
          </span>
          <button
            type="button"
            className="primary"
            onClick={() => addDeletion(selection.start, selection.end, linker || undefined)}
            disabled={!canDeleteSelection}
          >
            {deleteLabel}
          </button>
          <label>
            Linker
            <input
              value={linker}
              onChange={(event) => setLinker(event.target.value.toUpperCase().replace(/[^GS]/g, ""))}
              placeholder="GS only"
              aria-label="Custom linker or insertion sequence, G and S only"
            />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={!isGlycineSerineLinker(linker) || linker.length === 0}
            onClick={() => addInsertion(selection.end, linker)}
          >
            Insert linker after {selection.end}
          </button>
          <button
            type="button"
            className="ghost"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelection(undefined);
              setRangeStart("");
              setRangeEnd("");
              setHoverRange(undefined);
            }}
          >
            Clear
          </button>
        </div>
      )}
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {hover.text}
        </div>
      )}
      {readout && (
        <div className="drag-readout" style={{ left: readout.x + 12, top: readout.y + 12 }}>
          {readout.text}
        </div>
      )}
    </section>
  );
}

const SeqRow = memo(function SeqRow({
  cells,
  rowStart,
  rowEnd,
  construct,
  edits,
  features,
  selection,
  hover,
  onCellDown,
  onGripDown,
  onGripKeyDown,
}: {
  cells: SeqCell[];
  rowStart: number;
  rowEnd: number;
  construct: { start: number; end: number };
  edits: EditSpan[];
  features: UniProtFeature[];
  selection?: { start: number; end: number };
  hover?: { start: number; end: number };
  onCellDown: (event: ReactPointerEvent<HTMLDivElement>, cell: SeqCell) => void;
  onGripDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    drag: Exclude<Drag, { kind: "range" }>,
  ) => void;
  onGripKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    drag: Exclude<Drag, { kind: "range" }>,
  ) => void;
}) {
  return (
    <div className="seq-line">
      <span className="seq-index">{rowStart}</span>
      <div className="seq-col" style={{ width: rowPixelWidth(rowStart, rowEnd) }}>
        <div className="seq-track plddt">
          {cells.map((cell) => (
            <span
              key={`p-${cell.key}`}
              className="seq-feature"
              style={{
                left: xOffset(cell.canonical, rowStart),
                width: CELL,
                background: plddtColor(cell.plddt),
                opacity: 1,
                top: 0,
                height: 4,
              }}
            />
          ))}
        </div>
        <FeatureTrack
          rowStart={rowStart}
          rowEnd={rowEnd}
          features={features}
          type={["chain", "signal", "peptide"]}
        />
        <FeatureTrack rowStart={rowStart} rowEnd={rowEnd} features={features} type="domain" />
        <FeatureTrack
          rowStart={rowStart}
          rowEnd={rowEnd}
          features={features}
          type={["region", "motif", "compositional_bias"]}
        />
        <div className="seq-track edits">
          <SeqRail
            rowStart={rowStart}
            rowEnd={rowEnd}
            construct={construct}
            edits={edits}
            onGripDown={onGripDown}
            onGripKeyDown={onGripKeyDown}
          />
        </div>
        <div className="seq-cells">
          {cells.map((cell) => {
            const faded = residueFaded(cell.canonical, construct, edits);
            const selected =
              selection !== undefined &&
              cell.canonical >= selection.start &&
              cell.canonical <= selection.end;
            const hovered =
              hover !== undefined && cell.canonical >= hover.start && cell.canonical <= hover.end;
            return (
              <div
                key={cell.key}
                role="button"
                tabIndex={-1}
                className={[
                  "seq-cell",
                  faded ? "faded" : "",
                  selected ? "selected" : "",
                  hovered ? "hovered" : "",
                  hasBlockGap(cell.canonical, rowEnd) ? "seq-block-gap" : "",
                ].join(" ")}
                style={{ background: plddtColor(cell.plddt) }}
                data-canonical={cell.canonical}
                aria-label={`Residue ${cell.canonical} ${cell.letter}`}
                onPointerDown={(event) => onCellDown(event, cell)}
              >
                {cell.letter}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

function FeatureTrack({
  rowStart,
  rowEnd,
  features,
  type,
}: {
  rowStart: number;
  rowEnd: number;
  features: UniProtFeature[];
  type: UniProtFeature["type"] | Array<UniProtFeature["type"]>;
}) {
  const types = Array.isArray(type) ? type : [type];
  const shown = features.filter((feature) => types.includes(feature.type));
  return (
    <div className="seq-track">
      {shown.map((feature) => {
        const box = overlapBox(rowStart, rowEnd, feature.start, feature.end);
        if (!box) return null;
        return (
          <span
            key={feature.id}
            className={`seq-feature ${feature.type}`}
            title={`${feature.description?.trim() || FEATURE_TYPE_LABEL[feature.type]} ${feature.start}–${feature.end}`}
            style={{ left: box.left, width: box.width }}
          />
        );
      })}
    </div>
  );
}

function SeqRail({
  rowStart,
  rowEnd,
  construct,
  edits,
  onGripDown,
  onGripKeyDown,
}: {
  rowStart: number;
  rowEnd: number;
  construct: { start: number; end: number };
  edits: EditSpan[];
  onGripDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    drag: Exclude<Drag, { kind: "range" }>,
  ) => void;
  onGripKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    drag: Exclude<Drag, { kind: "range" }>,
  ) => void;
}) {
  const constructBox = overlapBox(rowStart, rowEnd, construct.start, construct.end);
  return (
    <div className="seq-rail">
      {constructBox && (
        <span
          className="seq-span construct"
          style={{ left: constructBox.left, width: constructBox.width }}
        />
      )}
      {edits.map((edit) => {
        if (edit.end < edit.start) {
          if (edit.start - 1 < rowStart || edit.start - 1 > rowEnd) return null;
          const left = xOffset(edit.start - 1, rowStart) + CELL - 5;
          return (
            <span key={edit.id} className="seq-insert-mark" style={{ left }} title={edit.insertion}>
              {edit.insertion ? `+${edit.insertion[0]}${edit.insertion.length}` : "+"}
            </span>
          );
        }
        const box = overlapBox(rowStart, rowEnd, edit.start, edit.end);
        if (!box) return null;
        return (
          <span
            key={edit.id}
            className={`seq-span edit ${edit.status}`}
            style={{ left: box.left, width: box.width }}
          />
        );
      })}
      {inRow(rowStart, rowEnd, construct.start) && (
        <button
          type="button"
          className="seq-grip construct start"
          style={{ left: xOffset(construct.start, rowStart) - 4 }}
          aria-label={`Construct start ${construct.start}`}
          onPointerDown={(event) =>
            onGripDown(event, {
              kind: "construct",
              edge: "start",
              start: construct.start,
              end: construct.end,
            })
          }
          onKeyDown={(event) =>
            onGripKeyDown(event, {
              kind: "construct",
              edge: "start",
              start: construct.start,
              end: construct.end,
            })
          }
        />
      )}
      {inRow(rowStart, rowEnd, construct.end) && (
        <button
          type="button"
          className="seq-grip construct end"
          style={{ left: xOffset(construct.end, rowStart) + CELL - GRIP + 4 }}
          aria-label={`Construct end ${construct.end}`}
          onPointerDown={(event) =>
            onGripDown(event, {
              kind: "construct",
              edge: "end",
              start: construct.start,
              end: construct.end,
            })
          }
          onKeyDown={(event) =>
            onGripKeyDown(event, {
              kind: "construct",
              edge: "end",
              start: construct.start,
              end: construct.end,
            })
          }
        />
      )}
      {edits.map((edit) => {
        if (edit.end < edit.start) return null;
        return (
          <span key={`${edit.id}-grips`}>
            {inRow(rowStart, rowEnd, edit.start) && (
              <button
                type="button"
                className="seq-grip edit start"
                style={{ left: xOffset(edit.start, rowStart) - 4 }}
                aria-label={`Deletion start ${edit.start}`}
                onPointerDown={(event) =>
                  onGripDown(event, {
                    kind: "edit",
                    editId: edit.id,
                    edge: "start",
                    start: edit.start,
                    end: edit.end,
                  })
                }
                onKeyDown={(event) =>
                  onGripKeyDown(event, {
                    kind: "edit",
                    editId: edit.id,
                    edge: "start",
                    start: edit.start,
                    end: edit.end,
                  })
                }
              />
            )}
            {inRow(rowStart, rowEnd, edit.end) && (
              <button
                type="button"
                className="seq-grip edit end"
                style={{ left: xOffset(edit.end, rowStart) + CELL - GRIP + 4 }}
                aria-label={`Deletion end ${edit.end}`}
                onPointerDown={(event) =>
                  onGripDown(event, {
                    kind: "edit",
                    editId: edit.id,
                    edge: "end",
                    start: edit.start,
                    end: edit.end,
                  })
                }
                onKeyDown={(event) =>
                  onGripKeyDown(event, {
                    kind: "edit",
                    editId: edit.id,
                    edge: "end",
                    start: edit.start,
                    end: edit.end,
                  })
                }
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

function SeqMinimap({
  length,
  construct,
  edits,
  candidates,
  onJump,
}: {
  length: number;
  construct: { start: number; end: number };
  edits: EditSpan[];
  candidates: Array<{ id: string; start: number; end: number }>;
  onJump: (position: number) => void;
}) {
  const pct = (value: number) => `${((value - 1) / length) * 100}%`;
  const width = (start: number, end: number) => `${((end - start + 1) / length) * 100}%`;
  return (
    <div
      className="seq-minimap"
      role="slider"
      aria-label="Sequence overview"
      aria-valuemin={1}
      aria-valuemax={length}
      aria-valuenow={construct.start}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        onJump(Math.max(1, Math.min(length, Math.round(ratio * length))));
      }}
    >
      <span
        className="seq-minimap-construct"
        style={{ left: pct(construct.start), width: width(construct.start, construct.end) }}
      />
      {candidates.map((candidate) => (
        <span
          key={candidate.id}
          className="seq-minimap-candidate"
          style={{ left: pct(candidate.start), width: width(candidate.start, candidate.end) }}
        />
      ))}
      {edits
        .filter((edit) => edit.end >= edit.start)
        .map((edit) => (
          <span
            key={edit.id}
            className={`seq-minimap-edit ${edit.status}`}
            style={{ left: pct(edit.start), width: width(edit.start, edit.end) }}
          />
        ))}
    </div>
  );
}

function overlapBox(rowStart: number, rowEnd: number, start: number, end: number) {
  if (end < rowStart || start > rowEnd) return null;
  const from = Math.max(start, rowStart);
  const to = Math.min(end, rowEnd);
  const left = xOffset(from, rowStart);
  return { left, width: xOffset(to, rowStart) + CELL - left };
}

function hasBlockGap(position: number, rowEnd: number) {
  return position % BLOCK === 0 && position !== rowEnd;
}

function spacersBefore(position: number, rowStart: number) {
  if (position <= rowStart) return 0;
  return Math.floor((position - 1) / BLOCK) - Math.floor((rowStart - 1) / BLOCK);
}

function xOffset(position: number, rowStart: number) {
  return (position - rowStart) * CELL + spacersBefore(position, rowStart) * GAP;
}

function rowPixelWidth(rowStart: number, rowEnd: number) {
  return xOffset(rowEnd, rowStart) + CELL;
}

function residuesThatFit(width: number) {
  let count = Math.max(20, Math.floor(width / CELL));
  while (count > 20 && count * CELL + Math.floor(count / BLOCK) * GAP > width) {
    count -= 1;
  }
  return count;
}

function inRow(rowStart: number, rowEnd: number, position: number) {
  return position >= rowStart && position <= rowEnd;
}

function visibleEdits(
  workspace: ReadyState,
  draftEdit?: { id: string; start: number; end: number } | null,
): EditSpan[] {
  return workspace.edits.flatMap((edit) => {
    if (edit.status === "rejected" || edit.type === "substitution") return [];
    const live = draftEdit?.id === edit.id;
    const start = live ? draftEdit.start : edit.start;
    const end = live ? draftEdit.end : edit.end;
    let insertion: string | undefined;
    if (live) {
      const interval = { start, end };
      if (classifyCandidate(interval, workspace.construct) === "internal") {
        insertion = computeInternalGeometry(interval, workspace.construct, workspace.structure.ca)
          ?.recommendedLinker;
      }
    } else if (edit.type === "replacement" && edit.insertedSequence.length > 0) {
      insertion = edit.insertedSequence;
    }
    return [
      {
        id: edit.id,
        start,
        end,
        insertion,
        status: edit.status,
        live,
      },
    ];
  });
}

function constructEdgeForRangeOrigin(
  origin: number,
  construct: { start: number; end: number },
  shift: boolean,
): "start" | "end" | undefined {
  if (shift || construct.start === construct.end) return undefined;
  if (origin === construct.start) return "start";
  if (origin === construct.end) return "end";
  return undefined;
}

function residueFaded(
  position: number,
  construct: { start: number; end: number },
  edits: EditSpan[],
): boolean {
  if (position < construct.start || position > construct.end) return true;
  return edits.some(
    (edit) =>
      edit.end >= edit.start &&
      position >= edit.start &&
      position <= edit.end &&
      (edit.status === "applied" || edit.live),
  );
}

function scrollWithin(wrap: HTMLElement, node: HTMLElement) {
  const wrapRect = wrap.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  if (nodeRect.top >= wrapRect.top && nodeRect.bottom <= wrapRect.bottom) return;
  wrap.scrollTop += nodeRect.top - wrapRect.top - wrap.clientHeight / 2 + nodeRect.height / 2;
}

function residueAtPoint(clientX: number, clientY: number): number | undefined {
  const rows = document.querySelectorAll(".seq-cells");
  for (const cells of rows) {
    if (!(cells instanceof HTMLElement)) continue;
    const rect = cells.getBoundingClientRect();
    if (clientY < rect.top - 28 || clientY > rect.bottom) continue;
    if (clientX < rect.left || clientX > rect.right) continue;
    const letters = cells.querySelectorAll("[data-canonical]");
    let nearest: { value: number; distance: number } | undefined;
    for (const letter of letters) {
      if (!(letter instanceof HTMLElement)) continue;
      const box = letter.getBoundingClientRect();
      const value = Number(letter.dataset.canonical);
      if (!Number.isFinite(value)) continue;
      if (clientX >= box.left && clientX <= box.right) return value;
      const distance = Math.min(Math.abs(clientX - box.left), Math.abs(clientX - box.right));
      if (!nearest || distance < nearest.distance) nearest = { value, distance };
    }
    if (nearest) return nearest.value;
  }
  return undefined;
}

function readoutText(start: number, end: number, originalStart: number, originalEnd: number) {
  const length = end - start + 1;
  const delta = length - (originalEnd - originalStart + 1);
  const signed = delta === 0 ? "0" : delta > 0 ? `+${delta}` : String(delta);
  return `${start}–${end} · ${length} aa (${signed})`;
}

function buildCells(workspace: ReadyState): SeqCell[] {
  return workspace.protein.sequence.split("").map((letter, index) => ({
    key: `aa-${index + 1}`,
    letter,
    canonical: index + 1,
    plddt: workspace.structure.plddt[index],
  }));
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}
