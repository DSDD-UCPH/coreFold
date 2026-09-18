import { useEffect, useRef, useState } from "react";
import type { PluginContext } from "molstar/lib/mol-plugin/context";
import type { Structure } from "molstar/lib/mol-model/structure";
import { useInteractionStore, type DragPreview } from "../state/interactionStore";
import { useWorkspaceStore, type ReadyState } from "../state/workspaceStore";
import { PlddtLegend } from "./PlddtLegend";

let structureApi: typeof import("molstar/lib/mol-model/structure") | null = null;

export function StructureViewer() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const pendingAction = useWorkspaceStore((state) => state.pendingAction);
  const dragPreview = useInteractionStore((state) => state.dragPreview);
  const hoverRange = useInteractionStore((state) => state.hoverRange);
  const hostRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<PluginContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = workspace.status === "ready" ? workspace : null;
  const entryId = ready?.structure.entryId ?? "";
  const mmcifText = ready?.structure.mmcifText ?? "";
  const minifiedSequence = ready?.derived.minifiedSequence ?? "";
  const pendingConstruct =
    pendingAction?.type === "construct"
      ? `${pendingAction.construct.start}-${pendingAction.construct.end}`
      : "";
  const constructKey = ready
    ? `${ready.construct.start}-${ready.construct.end}:${pendingConstruct}`
    : "";
  const editKey =
    ready?.edits
      .map((edit) => {
        if (edit.type === "substitution") return `${edit.id}:${edit.status}:${edit.position}`;
        return `${edit.id}:${edit.status}:${edit.type}:${edit.start}-${edit.end}:${edit.type === "replacement" ? edit.insertedSequence : ""}`;
      })
      .join("|") ?? "";
  const selSource = ready?.selection?.source;
  const selStart = ready?.selection?.start;
  const selEnd = ready?.selection?.end;
  const selAt = ready?.selection?.at;
  const previewKey = dragPreview
    ? `${dragPreview.construct?.start ?? ""}-${dragPreview.construct?.end ?? ""}:${dragPreview.edit?.id ?? ""}:${dragPreview.edit?.start ?? ""}-${dragPreview.edit?.end ?? ""}`
    : "";
  const previousConstruct = useRef("");
  const dragHighlightTimer = useRef(0);
  const cameraTimer = useRef(0);
  const lastCameraAt = useRef(0);
  const lingerRange = useRef<{ start: number; end: number } | null>(null);
  const cameraLinger = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const current = useWorkspaceStore.getState().workspace;
    const host = hostRef.current;
    if (current.status !== "ready" || !host || !mmcifText) return;
    const gen = Number(host.dataset.viewerGen ?? "0") + 1;
    host.dataset.viewerGen = String(gen);
    let cancelled = false;
    let plugin: PluginContext | null = null;
    let resize: ResizeObserver | undefined;

    const stillCurrent = () => !cancelled && host.dataset.viewerGen === String(gen);
    const resizeViewer = () => {
      if (!plugin || !stillCurrent()) return;
      syncViewerSize(plugin, host);
    };

    void (async () => {
      try {
        setError(null);
        plugin = await createViewer(host);
        if (!stillCurrent()) {
          plugin.dispose();
          return;
        }
        pluginRef.current = plugin;
        await loadStructure(plugin, current);
        if (!stillCurrent()) return;
        await styleRemoved(plugin, current);
        resizeViewer();
        plugin.managers.camera.reset();
        plugin.canvas3d?.requestDraw();
        resize = new ResizeObserver(() => resizeViewer());
        resize.observe(host);
        window.addEventListener("resize", resizeViewer);
        const loaded = useWorkspaceStore.getState().workspace;
        if (loaded.status === "ready") {
          resizeViewer();
          await focusCaRange(
            plugin,
            loaded.structure.ca,
            loaded.construct.start,
            loaded.construct.end,
          );
          if (loaded.selection) {
            await highlightResidues(plugin, loaded.selection.start, loaded.selection.end);
          }
        }
      } catch (err) {
        if (stillCurrent()) {
          setError(err instanceof Error ? err.message : "The 3D viewer failed to load.");
        }
      }
    })();

    return () => {
      cancelled = true;
      resize?.disconnect();
      window.removeEventListener("resize", resizeViewer);
      pluginRef.current = null;
      plugin?.unmount();
      plugin?.dispose();
    };
  }, [entryId, mmcifText]);

  useEffect(() => {
    const current = useWorkspaceStore.getState().workspace;
    if (current.status !== "ready" || !pluginRef.current) return;
    const plugin = pluginRef.current;
    const shouldFit = previousConstruct.current !== constructKey;
    previousConstruct.current = constructKey;
    void (async () => {
      await styleRemoved(plugin, current);
      const linger = lingerRange.current;
      if (linger) await highlightResidues(plugin, linger.start, linger.end);
      else if (current.selection) {
        await highlightResidues(plugin, current.selection.start, current.selection.end);
      }
      if (shouldFit) {
        await focusCaRange(
          plugin,
          current.structure.ca,
          current.construct.start,
          current.construct.end,
        );
      }
    })();
  }, [minifiedSequence, constructKey, editKey, previewKey]);

  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin) return;
    const current = useWorkspaceStore.getState().workspace;
    if (current.status !== "ready") return;
    const range = dragPreview?.edit ?? dragPreview?.construct;
    if (range) {
      window.clearTimeout(dragHighlightTimer.current);
      lingerRange.current = range;
      void highlightResidues(plugin, range.start, range.end);
      const target = dragPreview
        ? cameraTargetForPreview(dragPreview, current.construct, current.protein.length)
        : range;
      if (target) {
        cameraLinger.current = target;
        const aim = () => {
          lastCameraAt.current = performance.now();
          void focusCaRange(plugin, current.structure.ca, target.start, target.end, {
            durationMs: 140,
          });
        };
        if (performance.now() - lastCameraAt.current > 160) {
          aim();
        } else {
          window.clearTimeout(cameraTimer.current);
          cameraTimer.current = window.setTimeout(aim, 160);
        }
      }
      return () => {
        window.clearTimeout(dragHighlightTimer.current);
        window.clearTimeout(cameraTimer.current);
      };
    }
    const aimed = cameraLinger.current ?? lingerRange.current;
    if (aimed) {
      void focusCaRange(plugin, current.structure.ca, aimed.start, aimed.end, {
        durationMs: 250,
      });
    }
    dragHighlightTimer.current = window.setTimeout(() => {
      lingerRange.current = null;
      const latest = useWorkspaceStore.getState().workspace;
      if (latest.status === "ready" && latest.selection) {
        void highlightResidues(plugin, latest.selection.start, latest.selection.end);
      } else {
        plugin.managers.interactivity.lociSelects.deselectAll();
      }
    }, 2000);
    return () => window.clearTimeout(dragHighlightTimer.current);
  }, [previewKey, dragPreview]);

  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin || selStart === undefined || selEnd === undefined) return;
    if (selSource !== "focus" && selSource !== "sequence" && selSource !== "candidate_panel") {
      return;
    }
    if (dragPreview?.edit || dragPreview?.construct) return;
    const current = useWorkspaceStore.getState().workspace;
    if (current.status !== "ready") return;
    const tight = selSource === "focus";
    const range = tight
      ? { start: selStart, end: selEnd }
      : selectionCameraWindow(selStart, selEnd, current.protein.length);
    const aim = () => {
      lastCameraAt.current = performance.now();
      void focusCaRange(plugin, current.structure.ca, range.start, range.end, {
        durationMs: tight ? 250 : 160,
        extraRadius: tight ? 4 : 12,
        minRadius: tight ? 10 : 20,
      });
    };
    if (tight || performance.now() - lastCameraAt.current > 160) {
      aim();
      return undefined;
    }
    window.clearTimeout(cameraTimer.current);
    cameraTimer.current = window.setTimeout(aim, 160);
    return () => window.clearTimeout(cameraTimer.current);
  }, [selSource, selStart, selEnd, selAt, dragPreview]);

  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin) return;
    if (dragPreview?.edit || dragPreview?.construct) return;
    if (selStart !== undefined && selEnd !== undefined) {
      void highlightResidues(plugin, selStart, selEnd);
      return;
    }
    plugin.managers.interactivity.lociSelects.deselectAll();
  }, [selStart, selEnd, selAt, selSource, previewKey, dragPreview]);

  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin) return;
    const current = useWorkspaceStore.getState().workspace;
    const inProtein =
      hoverRange &&
      current.status === "ready" &&
      hoverRange.end >= 1 &&
      hoverRange.start <= current.protein.length;
    if (!inProtein) {
      plugin.managers.interactivity.lociHighlights.clearHighlights();
      return;
    }
    void hoverResidues(plugin, hoverRange.start, hoverRange.end);
  }, [hoverRange?.start, hoverRange?.end, constructKey]);

  if (!ready) return null;

  const reset = () => {
    const plugin = pluginRef.current;
    const host = hostRef.current;
    if (plugin && host) syncViewerSize(plugin, host);
    plugin?.managers.camera.reset();
  };

  const fit = () => {
    const current = useWorkspaceStore.getState().workspace;
    const plugin = pluginRef.current;
    const host = hostRef.current;
    if (current.status !== "ready" || !plugin) return;
    if (host) syncViewerSize(plugin, host);
    void focusCaRange(plugin, current.structure.ca, current.construct.start, current.construct.end);
  };

  return (
    <section className="structure-viewer">
      <div className="structure-toolbar">
        <h2>3D viewer</h2>
        <button type="button" className="ghost" onClick={reset}>
          Reset view
        </button>
        <button type="button" className="ghost" onClick={fit}>
          Fit active construct
        </button>
      </div>
      <div ref={hostRef} className="molstar-host" />
      {error && <p className="warn">{error}</p>}
      <p className="structure-caption">
        Drag to rotate, scroll to zoom.
        <PlddtLegend tone="dark" />
      </p>
    </section>
  );
}

async function createViewer(host: HTMLDivElement): Promise<PluginContext> {
  const { PluginContext } = await import("molstar/lib/mol-plugin/context");
  const { DefaultPluginSpec, PluginSpec } = await import("molstar/lib/mol-plugin/spec");
  const { PluginBehaviors } = await import("molstar/lib/mol-plugin/behavior");
  const { PluginConfig } = await import("molstar/lib/mol-plugin/config");
  const { Color } = await import("molstar/lib/mol-util/color");
  const { MAQualityAssessment } =
    await import("molstar/lib/extensions/model-archive/quality-assessment/behavior");
  structureApi = await import("molstar/lib/mol-model/structure");

  const spec = DefaultPluginSpec();
  spec.config = [
    ...(spec.config ?? []),
    [PluginConfig.Viewport.ShowExpand, false],
    [PluginConfig.Viewport.ShowControls, false],
    [PluginConfig.Viewport.ShowSettings, false],
    [PluginConfig.Viewport.ShowSelectionMode, false],
    [PluginConfig.Viewport.ShowAnimation, false],
  ];
  spec.canvas3d = {
    renderer: {
      backgroundColor: Color(0x111820),
      selectColor: Color(0x22c55e),
      highlightColor: Color(0x38bdf8),
      colorMarker: true,
      selectStrength: 1,
    },
  };
  spec.behaviors = [
    PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
    PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
    PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
    PluginSpec.Behavior(PluginBehaviors.Camera.CameraControls),
    PluginSpec.Behavior(MAQualityAssessment, { autoAttach: true, showTooltip: true }),
  ];
  const plugin = new PluginContext(spec);
  await plugin.init();
  if (!plugin.mount(host)) {
    plugin.dispose();
    throw new Error("WebGL is not available for the 3D viewer.");
  }
  plugin.layout.setRoot(host);
  plugin.managers.interactivity.setProps({ granularity: "residue" });
  plugin.canvas3d?.setProps({
    renderer: {
      backgroundColor: Color(0x111820),
      selectColor: Color(0x22c55e),
      highlightColor: Color(0x38bdf8),
      colorMarker: true,
      selectStrength: 1,
      highlightStrength: 1,
    },
  });
  syncViewerSize(plugin, host);
  return plugin;
}

function syncViewerSize(plugin: PluginContext, host: HTMLElement) {
  const context = plugin.canvas3dContext;
  const canvas = context?.canvas;
  if (!context || !canvas) return;
  const width = Math.max(1, Math.round(host.clientWidth));
  const height = Math.max(1, Math.round(host.clientHeight));
  const scale = context.pixelScale;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(pixelRatio * scale * width);
  canvas.height = Math.round(pixelRatio * scale * height);
  context.syncPixelScale();
  plugin.canvas3d?.requestResize();
}

async function loadStructure(plugin: PluginContext, workspace: ReadyState) {
  const data = await plugin.builders.data.rawData({
    data: workspace.structure.mmcifText,
    label: workspace.structure.entryId,
  });
  const trajectory = await plugin.builders.structure.parseTrajectory(data, "mmcif");
  try {
    await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default", {
      representationPreset: "polymer-cartoon",
      representationPresetParams: {
        theme: { globalName: "plddt-confidence" },
      },
    });
  } catch {
    await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default", {
      representationPreset: "polymer-cartoon",
      representationPresetParams: {
        theme: { globalName: "uncertainty" },
      },
    });
  }
  plugin.managers.camera.reset();
  plugin.canvas3d?.requestDraw();
}

async function styleRemoved(plugin: PluginContext, workspace: ReadyState) {
  const components = plugin.managers.structure.hierarchy.currentComponentGroups.flat();
  if (components.length === 0) return;
  const { setStructureOverpaint, clearStructureOverpaint } =
    await import("molstar/lib/mol-plugin-state/helpers/structure-overpaint");
  const { setStructureTransparency, clearStructureTransparency } =
    await import("molstar/lib/mol-plugin-state/helpers/structure-transparency");
  await clearStructureOverpaint(plugin, components);
  await clearStructureTransparency(plugin, components);
  const { Color } = await import("molstar/lib/mol-util/color");
  const pendingAction = useWorkspaceStore.getState().pendingAction;
  const pending = pendingAction?.type === "construct" ? pendingAction.construct : undefined;
  const livePreview = useInteractionStore.getState().dragPreview;
  const construct = livePreview?.construct ?? pending ?? workspace.construct;
  const outsideConstruct = construct.start > 1 || construct.end < workspace.protein.length;
  if (outsideConstruct) {
    const lociGetter = await outsideConstructLociGetter(construct.start, construct.end);
    await setStructureOverpaint(plugin, components, Color(0x9aa3ad), lociGetter);
    await setStructureTransparency(plugin, components, 1, lociGetter);
  }
  const removed = removedRanges(workspace);
  if (removed.length === 0) {
    plugin.canvas3d?.requestDraw();
    return;
  }
  const lociGetter = await residueRangesLociGetter(removed);
  await setStructureOverpaint(plugin, components, Color(0x9aa3ad), lociGetter);
  await setStructureTransparency(plugin, components, 0.65, lociGetter);
  plugin.canvas3d?.requestDraw();
}

function removedRanges(workspace: ReadyState): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const edit of workspace.edits) {
    if (edit.type === "substitution" || edit.status === "rejected") continue;
    const preview = useInteractionStore.getState().dragPreview?.edit;
    const live = preview?.id === edit.id ? preview : undefined;
    const start = live?.start ?? edit.start;
    const end = live?.end ?? edit.end;
    if (end < start) continue;
    if (edit.status === "applied" || live) ranges.push({ start, end });
  }
  return ranges;
}

async function residueTest(test: (Q: never, MS: never) => unknown) {
  const { MolScriptBuilder: MS } = await import("molstar/lib/mol-script/language/builder");
  const { Script } = await import("molstar/lib/mol-script/script");
  const { StructureSelection } = await import("molstar/lib/mol-model/structure/query");
  return async (structure: Structure) => {
    const selection = Script.getStructureSelection((Q) => {
      return Q.struct.generator.atomGroups({
        "residue-test": test(Q as never, MS as never) as never,
      });
    }, structure);
    return StructureSelection.toLociWithSourceUnits(selection);
  };
}

async function outsideConstructLociGetter(start: number, end: number) {
  return residueTest((Q, MS) =>
    (
      Q as {
        core: {
          logic: { not: (xs: unknown[]) => unknown };
          rel: { inRange: (xs: unknown[]) => unknown };
        };
      }
    ).core.logic.not([
      (Q as { core: { rel: { inRange: (xs: unknown[]) => unknown } } }).core.rel.inRange([
        (MS as { ammp: (name: string) => unknown }).ammp("label_seq_id"),
        start,
        end,
      ]),
    ]),
  );
}

async function residueRangesLociGetter(ranges: Array<{ start: number; end: number }>) {
  return residueTest((Q, MS) => {
    const q = Q as {
      core: {
        rel: { inRange: (xs: unknown[]) => unknown };
        logic: { or: (xs: unknown[]) => unknown };
      };
    };
    const ms = MS as { ammp: (name: string) => unknown };
    const tests = ranges.map((range) =>
      q.core.rel.inRange([ms.ammp("label_seq_id"), range.start, range.end]),
    );
    if (tests.length === 1) return tests[0];
    return q.core.logic.or(tests);
  });
}

function cameraTargetForPreview(
  preview: DragPreview,
  construct: { start: number; end: number },
  proteinLength: number,
): { start: number; end: number } | undefined {
  if (preview.edit) {
    return { start: preview.edit.start, end: preview.edit.end };
  }
  if (!preview.construct) return undefined;
  const kept = preview.construct;
  const pad = 16;
  if (kept.start !== construct.start) {
    return {
      start: Math.max(1, kept.start - pad),
      end: Math.min(proteinLength, kept.start + pad),
    };
  }
  if (kept.end !== construct.end) {
    return {
      start: Math.max(1, kept.end - pad),
      end: Math.min(proteinLength, kept.end + pad),
    };
  }
  return kept;
}

async function highlightResidues(plugin: PluginContext, start: number, end: number) {
  const getter = await residueRangesLociGetter([{ start, end }]);
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return;
  const cell = structures[0].cell.obj?.data;
  if (!cell) return;
  const loci = await getter(cell);
  if (!structureApi || !structureApi.StructureElement.Loci.is(loci) || loci.elements.length === 0) {
    return;
  }
  plugin.managers.interactivity.lociSelects.selectOnly({ loci });
  plugin.canvas3d?.requestDraw();
}

async function hoverResidues(plugin: PluginContext, start: number, end: number) {
  const getter = await residueRangesLociGetter([{ start, end }]);
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structures.length === 0) return;
  const cell = structures[0].cell.obj?.data;
  if (!cell) return;
  const loci = await getter(cell);
  if (!structureApi || !structureApi.StructureElement.Loci.is(loci) || loci.elements.length === 0) {
    return;
  }
  plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
}

function selectionCameraWindow(
  start: number,
  end: number,
  proteinLength: number,
): { start: number; end: number } {
  const minSpan = 48;
  const edgePad = 20;
  let from = start - edgePad;
  let to = end + edgePad;
  const span = to - from + 1;
  if (span < minSpan) {
    const extra = Math.ceil((minSpan - span) / 2);
    from -= extra;
    to += extra;
  }
  return {
    start: Math.max(1, from),
    end: Math.min(proteinLength, to),
  };
}

async function focusCaRange(
  plugin: PluginContext,
  ca: ReadyState["structure"]["ca"],
  start: number,
  end: number,
  options: { durationMs?: number; extraRadius?: number; minRadius?: number } = {},
) {
  const points: Array<{ x: number; y: number; z: number }> = [];
  for (let i = start; i <= end; i += 1) {
    const point = ca[i - 1];
    if (point && Number.isFinite(point.x)) points.push(point);
  }
  if (points.length === 0) return;
  const { Sphere3D } = await import("molstar/lib/mol-math/geometry/primitives/sphere3d");
  const { Vec3 } = await import("molstar/lib/mol-math/linear-algebra/3d/vec3");
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const point of points) {
    sx += point.x;
    sy += point.y;
    sz += point.z;
  }
  const n = points.length;
  const center = Vec3.create(sx / n, sy / n, sz / n);
  const distances = points
    .map((point) => {
      const dx = point.x - center[0];
      const dy = point.y - center[1];
      const dz = point.z - center[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    })
    .sort((a, b) => a - b);
  const radius =
    distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.85))] || 4;
  plugin.managers.camera.focusSphere(Sphere3D.create(center, radius), {
    extraRadius: options.extraRadius ?? 4,
    minRadius: options.minRadius ?? 10,
    durationMs: options.durationMs ?? 250,
  });
}
