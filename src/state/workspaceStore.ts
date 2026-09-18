import { create } from "zustand";
import {
  ALGORITHM_VERSION,
  appliedEdits,
  applyBoundaryToEdit,
  automaticProposalEdits,
  buildCandidates,
  buildResidueMap,
  clampDeletionBounds,
  clampIntervalToConstruct,
  clipEditsToConstruct,
  coalesceTouchingDeletions,
  DEFAULT_ANALYSIS_SETTINGS,
  classifyCandidate,
  computeInternalGeometry,
  domainConstruct,
  estimatedThroughputGain,
  exportFasta,
  exportResidueMapCsv,
  COFOLDING_EXPORTS,
  formatThroughputGain,
  fullLengthConstruct,
  initialConstruct,
  isGlycineSerineLinker,
  selectableFeatures,
  originalConstructSequence,
  reconstructMinifiedSequence,
  referenceConstructLength,
  serializeGreenFold,
  SELECTABLE_FEATURE_TYPES,
  shareUrl,
  spanDomainConstruct,
  terminalTrimForEdge,
  validateAppliedEdits,
  interpretProteinQuery,
  type AnalysisSettings,
  type Candidate,
  type Construct,
  type Edit,
  type ProteinRecord,
  type ResidueMapRow,
  type Selection,
  type StructureRecord,
} from "../domain";
import { restoreFromGreenFold } from "../domain/greenfold";
import {
  createBrowserCache,
  DataError,
  fetchAlphaFoldStructure,
  fetchProteinRecord,
  resolveProteinQuery,
  type AmbiguityCandidate,
} from "../data";
import { notifyCommit } from "./interactionStore";

export type LoadStage =
  | "Resolving UniProt entry"
  | "Loading canonical sequence and annotations"
  | "Loading AlphaFold model"
  | "Mapping confidence and coordinates"
  | "Generating automatic proposal";

export type HistorySlice = {
  construct: Construct;
  settings: AnalysisSettings;
  edits: Edit[];
};

export type DerivedWorkspace = {
  originalSequence: string;
  minifiedSequence: string;
  residueMap: ResidueMapRow[];
  originalLength: number;
  minifiedLength: number;
  referenceLength: number;
  residuesRemoved: number;
  sequenceReductionPct: number;
  editCount: number;
  throughputGain: number;
  throughputLabel: string;
  greenfold: string;
};

export type ReadyState = {
  status: "ready";
  protein: ProteinRecord;
  structure: StructureRecord;
  candidates: Candidate[];
  construct: Construct;
  settings: AnalysisSettings;
  edits: Edit[];
  selectedCandidateId?: string;
  selection?: Selection;
  past: HistorySlice[];
  future: HistorySlice[];
  derived: DerivedWorkspace;
  throughputUsesMinifiedAsOriginal: boolean;
};

export type PendingAction =
  | { type: "load"; query: string; greenfold?: string }
  | { type: "reset" }
  | { type: "home" }
  | { type: "construct"; construct: Construct }
  | { type: "settings"; settings: AnalysisSettings }
  | { type: "history"; query: string; greenfold: string };

export type WorkspaceState =
  | { status: "empty" }
  | { status: "loading"; query: string; stage: LoadStage }
  | { status: "ambiguous"; query: string; candidates: AmbiguityCandidate[] }
  | { status: "error"; message: string; query?: string }
  | { status: "unsupported"; message: string; query?: string }
  | ReadyState;

type Store = {
  workspace: WorkspaceState;
  pendingAction?: PendingAction;
  load: (query: string, options?: { greenfold?: string; force?: boolean }) => Promise<void>;
  chooseCandidate: (accession: string) => Promise<void>;
  acceptEdit: (id: string) => void;
  rejectEdit: (id: string) => void;
  restoreEdit: (id: string) => void;
  setLinker: (id: string, sequence: string) => void;
  commitBoundary: (id: string, start: number, end: number) => void;
  resetToProposal: (id: string, candidateId?: string) => void;
  resizeConstruct: (
    start: number,
    end: number,
    options?: { force?: boolean; edge?: "start" | "end" },
  ) => void;
  addDeletion: (start: number, end: number, linker?: string, candidateId?: string) => void;
  applyCandidate: (id: string) => void;
  addInsertion: (after: number, sequence: string) => void;
  selectCandidate: (id?: string) => void;
  setSelection: (selection?: Selection) => void;
  switchConstruct: (construct: Construct, options?: { force?: boolean }) => void;
  applySettings: (settings: AnalysisSettings, options?: { force?: boolean }) => void;
  resetDesign: (options?: { force?: boolean }) => void;
  goHome: (options?: { force?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  hasUserEdits: () => boolean;
  requestAction: (action: PendingAction) => void;
  confirmPendingAction: () => void;
  cancelPendingAction: () => void;
};

const cache = createBrowserCache();
let loadGeneration = 0;

function snapshot(state: ReadyState): HistorySlice {
  return { construct: state.construct, settings: state.settings, edits: state.edits };
}

export function derive(
  protein: ProteinRecord,
  construct: Construct,
  edits: Edit[],
  _candidates: Candidate[],
  throughputUsesMinifiedAsOriginal: boolean,
): DerivedWorkspace {
  validateAppliedEdits(edits, construct, construct.end - construct.start + 1);
  const originalSequence = originalConstructSequence(protein.sequence, construct);
  const minifiedSequence = reconstructMinifiedSequence(protein.sequence, construct, edits);
  const residueMap = buildResidueMap(protein.sequence, construct, edits);
  const originalLength = originalSequence.length;
  const minifiedLength = minifiedSequence.length;
  const referenceLength = referenceConstructLength(protein, construct);
  const applied = appliedEdits(edits);
  const gain = throughputUsesMinifiedAsOriginal
    ? 1
    : estimatedThroughputGain(referenceLength, minifiedLength);
  return {
    originalSequence,
    minifiedSequence,
    residueMap,
    originalLength,
    minifiedLength,
    referenceLength,
    residuesRemoved: referenceLength - minifiedLength,
    sequenceReductionPct: referenceLength === 0 ? 0 : (1 - minifiedLength / referenceLength) * 100,
    editCount: applied.length,
    throughputGain: gain,
    throughputLabel: formatThroughputGain(gain),
    greenfold: serializeGreenFold(protein, construct, edits),
  };
}

function propose(
  protein: ProteinRecord,
  structure: StructureRecord,
  construct: Construct,
  settings: AnalysisSettings,
) {
  const candidates = buildCandidates(protein, structure, construct, settings);
  return { candidates, edits: automaticProposalEdits(candidates) };
}

export const useWorkspaceStore = create<Store>((set, get) => ({
  workspace: { status: "empty" },
  pendingAction: undefined,

  hasUserEdits: () => {
    const { workspace } = get();
    if (workspace.status !== "ready") return false;
    return (
      workspace.past.length > 1 ||
      workspace.future.length > 0 ||
      workspace.edits.some((edit) => edit.source === "user")
    );
  },

  load: async (query, options) => {
    if (!options?.force && get().hasUserEdits()) {
      set({ pendingAction: { type: "load", query, greenfold: options?.greenfold } });
      return;
    }
    const parsed = interpretProteinQuery(query, options?.greenfold);
    const resolvedQuery = parsed.query;
    const greenfold = parsed.greenfold ?? options?.greenfold;
    const gen = ++loadGeneration;
    set({
      workspace: { status: "loading", query: resolvedQuery, stage: "Resolving UniProt entry" },
      pendingAction: undefined,
    });
    try {
      const resolved = await resolveProteinQuery(resolvedQuery, cache);
      if (gen !== loadGeneration) return;
      if (resolved.status === "ambiguous") {
        set({
          workspace: { status: "ambiguous", query: resolvedQuery, candidates: resolved.candidates },
        });
        return;
      }
      await loadAccession(resolved.accession, resolvedQuery, greenfold, gen, set);
    } catch (error) {
      if (gen !== loadGeneration) return;
      set({ workspace: errorState(error, resolvedQuery) });
    }
  },

  chooseCandidate: async (accession) => {
    const { workspace } = get();
    const query = workspace.status === "ambiguous" ? workspace.query : accession;
    const gen = ++loadGeneration;
    set({
      workspace: { status: "loading", query, stage: "Loading canonical sequence and annotations" },
    });
    try {
      await loadAccession(accession, query, undefined, gen, set);
    } catch (error) {
      if (gen !== loadGeneration) return;
      set({ workspace: errorState(error, query) });
    }
  },

  acceptEdit: (id) =>
    mutateReady(
      set,
      get,
      (state) => ({
        edits: state.edits.map((edit) => (edit.id === id ? { ...edit, status: "applied" } : edit)),
      }),
      "Accepted replacement",
    ),

  rejectEdit: (id) =>
    mutateReady(
      set,
      get,
      (state) => ({
        edits: state.edits.map((edit) => (edit.id === id ? { ...edit, status: "rejected" } : edit)),
      }),
      "Rejected region",
    ),

  restoreEdit: (id) =>
    mutateReady(
      set,
      get,
      (state) => ({
        edits: state.edits.map((edit) => {
          if (edit.id !== id) return edit;
          if (edit.status === "applied" || edit.status === "rejected") {
            return { ...edit, status: "pending" };
          }
          return { ...edit, status: "applied" };
        }),
      }),
      "Restored region",
    ),

  setLinker: (id, sequence) => {
    if (!isGlycineSerineLinker(sequence)) return;
    mutateReady(
      set,
      get,
      (state) => ({
        edits: state.edits.map((edit) =>
          edit.id === id && edit.type === "replacement"
            ? {
                ...edit,
                insertedSequence: sequence.toUpperCase(),
                source: edit.candidateId ? edit.source : "user",
              }
            : edit,
        ),
      }),
      "Updated linker",
    );
  },

  commitBoundary: (id, start, end) =>
    mutateReady(
      set,
      get,
      (state) => {
        const current = state.edits.find((edit) => edit.id === id);
        if (!current || current.type === "substitution") return {};
        const proposed = {
          start: Math.max(state.construct.start, Math.min(start, end)),
          end: Math.min(state.construct.end, Math.max(start, end)),
        };
        const mergeable = state.edits.flatMap((edit) => {
          if (edit.id === id || edit.status === "rejected" || edit.type === "substitution")
            return [];
          if (edit.end < edit.start) return [];
          return [edit];
        });
        const coalesced = coalesceTouchingDeletions(
          proposed,
          mergeable.map((edit) => ({ id: edit.id, start: edit.start, end: edit.end })),
        );
        const remainingOthers = mergeable
          .filter((edit) => !coalesced.absorbedIds.includes(edit.id))
          .map((edit) => ({ start: edit.start, end: edit.end }));
        const clamped = clampDeletionBounds(coalesced.span, state.construct, remainingOthers);
        const klass = classifyCandidate(clamped, state.construct);
        if (klass === "entire_construct") return {};
        const geometry =
          klass === "internal"
            ? computeInternalGeometry(clamped, state.construct, state.structure.ca)
            : undefined;
        const absorbedEdits = mergeable.filter((edit) => coalesced.absorbedIds.includes(edit.id));
        const linkedEdit = current.candidateId
          ? current
          : (absorbedEdits.find((edit) => edit.candidateId) ?? current);
        const originalProposal = linkedEdit.candidateId
          ? state.candidates.find((candidate) => candidate.id === linkedEdit.candidateId)
          : undefined;
        const next = applyBoundaryToEdit(
          current,
          clamped,
          klass,
          geometry,
          originalProposal
            ? { start: originalProposal.start, end: originalProposal.end }
            : coalesced.absorbedIds.length > 0
              ? { start: current.start, end: current.end }
              : undefined,
        );
        const merged =
          coalesced.absorbedIds.length > 0
            ? {
                ...next,
                source: "user" as const,
                candidateId: linkedEdit.candidateId ?? next.candidateId,
              }
            : next;
        return {
          edits: state.edits
            .filter((edit) => !coalesced.absorbedIds.includes(edit.id))
            .map((edit) => (edit.id === id ? merged : edit)),
        };
      },
      `Updated region ${start}–${end}`,
    ),

  resetToProposal: (id, candidateId) => {
    const { workspace } = get();
    if (workspace.status !== "ready") return;
    const edit = workspace.edits.find((item) => item.id === id);
    if (!edit || edit.type === "substitution") return;
    const linked = candidateId ?? edit.candidateId;
    if (!linked) return;
    const candidate = workspace.candidates.find((item) => item.id === linked);
    if (!candidate) return;
    get().commitBoundary(id, candidate.start, candidate.end);
  },

  addDeletion: (start, end, linker, candidateId) =>
    mutateReady(
      set,
      get,
      (state) => {
        const scoped = clampIntervalToConstruct({ start, end }, state.construct);
        if (!scoped) return {};
        const overlapping = (edit: Edit) => {
          if (edit.type === "substitution") return false;
          return !(edit.end < scoped.start || edit.start > scoped.end);
        };
        const clamped = clampDeletionBounds(
          scoped,
          state.construct,
          appliedSpans(state.edits.filter((edit) => !overlapping(edit))),
        );
        const klass = classifyCandidate(clamped, state.construct);
        if (klass === "entire_construct") return {};
        const remaining = state.edits.filter((edit) => {
          if (edit.type === "substitution") return true;
          return edit.end < clamped.start || edit.start > clamped.end;
        });
        const linked =
          candidateId ??
          state.candidates.find(
            (candidate) => candidate.start === clamped.start && candidate.end === clamped.end,
          )?.id;
        if (klass === "internal") {
          const geometry = computeInternalGeometry(clamped, state.construct, state.structure.ca);
          const sequence =
            linker !== undefined && isGlycineSerineLinker(linker)
              ? linker.toUpperCase()
              : (geometry?.recommendedLinker ?? "");
          remaining.push({
            id: `edit-replacement-${clamped.start}-${clamped.end}`,
            type: "replacement",
            source: linked ? "automatic" : "user",
            status: "applied",
            start: clamped.start,
            end: clamped.end,
            insertedSequence: sequence,
            recommendedSequence: geometry?.recommendedLinker,
            anchorDistanceAngstrom: geometry?.distanceAngstrom,
            candidateId: linked,
          });
        } else {
          remaining.push({
            id: `edit-deletion-${clamped.start}-${clamped.end}`,
            type: "deletion",
            source: linked ? "automatic" : "user",
            status: "applied",
            start: clamped.start,
            end: clamped.end,
            candidateId: linked,
          });
        }
        return { edits: remaining, selectedCandidateId: undefined, selection: undefined };
      },
      `Deleted ${start}–${end}`,
    ),

  applyCandidate: (id) => {
    const { workspace } = get();
    if (workspace.status !== "ready") return;
    const candidate = workspace.candidates.find((item) => item.id === id);
    if (!candidate) return;
    const existing = workspace.edits.find(
      (edit) =>
        (edit.type === "deletion" || edit.type === "replacement") &&
        (edit.candidateId === candidate.id ||
          (edit.start === candidate.start && edit.end === candidate.end) ||
          (edit.start <= candidate.start && edit.end >= candidate.end)),
    );
    if (existing && existing.status === "pending") {
      get().acceptEdit(existing.id);
      return;
    }
    if (existing && existing.status === "applied") return;
    const linker =
      candidate.internal && isGlycineSerineLinker(candidate.internal.recommendedLinker)
        ? candidate.internal.recommendedLinker
        : undefined;
    get().addDeletion(candidate.start, candidate.end, linker, candidate.id);
  },

  addInsertion: (after, sequence) => {
    if (!isGlycineSerineLinker(sequence) || sequence.length === 0) return;
    mutateReady(
      set,
      get,
      (state) => {
        const anchor = Math.min(state.construct.end, Math.max(state.construct.start - 1, after));
        const remaining = state.edits.filter((edit) => {
          if (edit.type === "substitution") return true;
          if (edit.type === "replacement" && edit.end < edit.start) {
            return edit.start - 1 !== anchor;
          }
          return true;
        });
        remaining.push({
          id: `edit-replacement-${anchor + 1}-${anchor}`,
          type: "replacement",
          source: "user",
          status: "applied",
          start: anchor + 1,
          end: anchor,
          insertedSequence: sequence.toUpperCase(),
        });
        return { edits: remaining };
      },
      `Inserted after ${after}`,
    );
  },

  selectCandidate: (id) => {
    const { workspace } = get();
    if (workspace.status !== "ready") return;
    set({ workspace: { ...workspace, selectedCandidateId: id } });
  },

  setSelection: (selection) => {
    const { workspace } = get();
    if (workspace.status !== "ready") return;
    if (!selection) {
      set({ workspace: { ...workspace, selection: undefined } });
      return;
    }
    const ordered = {
      start: Math.min(selection.start, selection.end),
      end: Math.max(selection.start, selection.end),
    };
    const inProtein = {
      start: Math.max(1, ordered.start),
      end: Math.min(workspace.protein.length, ordered.end),
    };
    if (inProtein.start > inProtein.end) {
      set({ workspace: { ...workspace, selection: undefined } });
      return;
    }
    const highlightOnly = selection.source === "focus" || selection.source === "candidate_panel";
    const scoped = highlightOnly
      ? inProtein
      : clampIntervalToConstruct(inProtein, workspace.construct);
    set({
      workspace: {
        ...workspace,
        selection: scoped ? { ...selection, ...scoped } : undefined,
      },
    });
  },

  switchConstruct: (construct, options) => {
    const { workspace } = get();
    if (workspace.status !== "ready") return;
    if (!options?.force && get().hasUserEdits()) {
      set({ pendingAction: { type: "construct", construct } });
      return;
    }
    set({ workspace: applyConstruct(workspace, construct), pendingAction: undefined });
  },

  resizeConstruct: (start, end, options) => {
    const { workspace } = get();
    if (workspace.status !== "ready") return;
    const edge = options?.edge ?? (start !== workspace.construct.start ? "start" : "end");
    if (workspace.construct.kind === "full_length") {
      const keptStart = Math.min(
        workspace.construct.end,
        Math.max(workspace.construct.start, start),
      );
      const keptEnd = Math.min(workspace.construct.end, Math.max(workspace.construct.start, end));
      if (
        (edge === "start" && keptStart === workspace.construct.start) ||
        (edge === "end" && keptEnd === workspace.construct.end)
      ) {
        return;
      }
      mutateReady(
        set,
        get,
        (state) => {
          const klass = edge === "start" ? "n_terminal" : "c_terminal";
          const remaining = state.edits.filter((edit) => {
            if (edit.type === "substitution") return true;
            if (edit.end < edit.start) return true;
            return classifyCandidate(edit, state.construct) !== klass;
          });
          const trim = terminalTrimForEdge(state.construct, edge, keptStart, keptEnd);
          if (trim) {
            remaining.push({
              id: `edit-deletion-${trim.start}-${trim.end}`,
              type: "deletion",
              source: "user",
              status: "applied",
              start: trim.start,
              end: trim.end,
            });
          }
          return { edits: remaining };
        },
        edge === "start"
          ? `Trimmed N-terminus to ${keptStart}`
          : `Trimmed C-terminus to ${keptEnd}`,
      );
      return;
    }
    const lo = Math.max(1, Math.min(start, end));
    const hi = Math.min(workspace.protein.length, Math.max(start, end));
    if (lo > hi) return;
    if (lo === workspace.construct.start && hi === workspace.construct.end) return;
    const extended =
      (edge === "start" && lo < workspace.construct.start) ||
      (edge === "end" && hi > workspace.construct.end);
    mutateReady(
      set,
      get,
      (state) => {
        const construct = { ...state.construct, start: lo, end: hi };
        const edits = clipEditsToConstruct(state.edits, construct);
        const candidates = state.candidates.filter(
          (candidate) => candidate.end >= lo && candidate.start <= hi,
        );
        const selectedCandidateId = candidates.some(
          (candidate) => candidate.id === state.selectedCandidateId,
        )
          ? state.selectedCandidateId
          : undefined;
        return { construct, edits, candidates, selectedCandidateId };
      },
      edge === "start"
        ? `${extended ? "Extended" : "Trimmed"} N-terminus to ${lo}`
        : `${extended ? "Extended" : "Trimmed"} C-terminus to ${hi}`,
    );
  },

  applySettings: (settings, options) => {
    const { workspace } = get();
    if (workspace.status !== "ready") return;
    if (!options?.force && get().hasUserEdits()) {
      set({ pendingAction: { type: "settings", settings } });
      return;
    }
    const proposed = propose(workspace.protein, workspace.structure, workspace.construct, settings);
    set({
      pendingAction: undefined,
      workspace: {
        ...workspace,
        settings,
        candidates: proposed.candidates,
        edits: proposed.edits,
        past: [{ construct: workspace.construct, settings, edits: [] }],
        future: [],
        derived: derive(
          workspace.protein,
          workspace.construct,
          proposed.edits,
          proposed.candidates,
          false,
        ),
      },
    });
  },

  resetDesign: (options) => {
    const { workspace } = get();
    if (workspace.status !== "ready") return;
    if (!options?.force && get().hasUserEdits()) {
      set({ pendingAction: { type: "reset" } });
      return;
    }
    const construct = initialConstruct(workspace.protein);
    set({
      pendingAction: undefined,
      workspace: applyConstruct({ ...workspace, settings: DEFAULT_ANALYSIS_SETTINGS }, construct),
    });
    notifyCommit("Reset to automatic proposal");
  },

  goHome: (options) => {
    const { workspace } = get();
    if (workspace.status === "empty") return;
    if (!options?.force && get().hasUserEdits()) {
      set({ pendingAction: { type: "home" } });
      return;
    }
    loadGeneration += 1;
    set({ workspace: { status: "empty" }, pendingAction: undefined });
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  },

  requestAction: (action) => {
    if (get().hasUserEdits()) {
      set({ pendingAction: action });
      return;
    }
    runPendingAction(action, get, set);
  },

  confirmPendingAction: () => {
    const action = get().pendingAction;
    if (!action) return;
    runPendingAction(action, get, set);
  },

  cancelPendingAction: () => set({ pendingAction: undefined }),

  undo: () => {
    const { workspace } = get();
    if (workspace.status !== "ready" || workspace.past.length === 0) return;
    const previous = workspace.past[workspace.past.length - 1];
    const present = snapshot(workspace);
    set({
      workspace: {
        ...restoreSlice(workspace, previous),
        past: workspace.past.slice(0, -1),
        future: [present, ...workspace.future],
      },
    });
  },

  redo: () => {
    const { workspace } = get();
    if (workspace.status !== "ready" || workspace.future.length === 0) return;
    const next = workspace.future[0];
    const present = snapshot(workspace);
    set({
      workspace: {
        ...restoreSlice(workspace, next),
        past: [...workspace.past, present],
        future: workspace.future.slice(1),
      },
    });
  },
}));

function applyConstruct(state: ReadyState, construct: Construct): ReadyState {
  const proposed = propose(state.protein, state.structure, construct, state.settings);
  return {
    ...state,
    construct,
    candidates: proposed.candidates,
    edits: proposed.edits,
    selectedCandidateId: undefined,
    selection: undefined,
    past: [{ construct, settings: state.settings, edits: [] }],
    future: [],
    throughputUsesMinifiedAsOriginal: false,
    derived: derive(state.protein, construct, proposed.edits, proposed.candidates, false),
  };
}

function restoreSlice(state: ReadyState, slice: HistorySlice): ReadyState {
  const candidates = buildCandidates(
    state.protein,
    state.structure,
    slice.construct,
    slice.settings,
  );
  const selection =
    state.selection &&
    state.selection.start >= slice.construct.start &&
    state.selection.end <= slice.construct.end
      ? state.selection
      : undefined;
  return {
    ...state,
    ...slice,
    candidates,
    selection,
    derived: derive(
      state.protein,
      slice.construct,
      slice.edits,
      candidates,
      state.throughputUsesMinifiedAsOriginal,
    ),
  };
}

function mutateReady(
  set: (partial: Partial<Store>) => void,
  get: () => Store,
  updater: (state: ReadyState) => Partial<ReadyState>,
  message?: string,
) {
  const { workspace } = get();
  if (workspace.status !== "ready") return;
  const patch = updater(workspace);
  if (Object.keys(patch).length === 0) return;
  const merged: ReadyState = { ...workspace, ...patch, future: [] };
  try {
    merged.derived = derive(
      merged.protein,
      merged.construct,
      merged.edits,
      merged.candidates,
      merged.throughputUsesMinifiedAsOriginal,
    );
  } catch {
    return;
  }
  merged.past = [...workspace.past, snapshot(workspace)];
  set({ workspace: merged });
  if (message) notifyCommit(message);
}

function runPendingAction(
  action: PendingAction,
  get: () => Store,
  set: (partial: Partial<Store>) => void,
) {
  set({ pendingAction: undefined });
  if (action.type === "load") {
    void get().load(action.query, { greenfold: action.greenfold, force: true });
    return;
  }
  if (action.type === "history") {
    void get().load(action.query, { greenfold: action.greenfold, force: true });
    return;
  }
  if (action.type === "reset") {
    get().resetDesign({ force: true });
    return;
  }
  if (action.type === "home") {
    get().goHome({ force: true });
    return;
  }
  if (action.type === "construct") {
    get().switchConstruct(action.construct, { force: true });
    return;
  }
  get().applySettings(action.settings, { force: true });
}

function appliedSpans(edits: Edit[]): Array<{ start: number; end: number }> {
  return edits
    .filter((edit) => edit.status === "applied" && edit.type !== "substitution")
    .map((edit) =>
      edit.type === "substitution"
        ? { start: edit.position, end: edit.position }
        : { start: edit.start, end: edit.end },
    )
    .filter((span) => span.end >= span.start);
}

export function constructFeatureIds(construct: Construct): string[] {
  return construct.featureId ? construct.featureId.split("+").filter(Boolean) : [];
}

async function loadAccession(
  accession: string,
  query: string,
  greenfold: string | undefined,
  gen: number,
  set: (partial: Partial<Store>) => void,
) {
  const stillCurrent = () => gen === loadGeneration;
  if (!stillCurrent()) return;
  set({
    workspace: { status: "loading", query, stage: "Loading canonical sequence and annotations" },
  });
  const protein = await fetchProteinRecord(accession, cache);
  if (!stillCurrent()) return;
  set({ workspace: { status: "loading", query, stage: "Loading AlphaFold model" } });
  const structure = await fetchAlphaFoldStructure(protein, cache);
  if (!stillCurrent()) return;
  set({ workspace: { status: "loading", query, stage: "Mapping confidence and coordinates" } });
  set({ workspace: { status: "loading", query, stage: "Generating automatic proposal" } });
  const settings = DEFAULT_ANALYSIS_SETTINGS;
  let construct = initialConstruct(protein);
  let proposed = propose(protein, structure, construct, settings);
  let throughputUsesMinifiedAsOriginal = false;
  if (greenfold) {
    const restored = restoreFromGreenFold(greenfold, protein.length, protein.accession);
    if (restored.chainRequested) {
      throw new DataError(
        "malformed_greenfold",
        "This share link uses GreenFold [chain], which coreFold does not restore in V1.",
      );
    }
    construct = matchRestoredConstruct(protein, restored.construct);
    proposed = {
      candidates: buildCandidates(protein, structure, construct, settings),
      edits: restored.edits,
    };
    throughputUsesMinifiedAsOriginal = restored.throughputUsesMinifiedAsOriginal;
  }
  if (!stillCurrent()) return;
  set({
    workspace: {
      status: "ready",
      protein,
      structure,
      candidates: proposed.candidates,
      construct,
      settings,
      edits: proposed.edits,
      past: [{ construct, settings, edits: [] }],
      future: [],
      throughputUsesMinifiedAsOriginal,
      derived: derive(
        protein,
        construct,
        proposed.edits,
        proposed.candidates,
        throughputUsesMinifiedAsOriginal,
      ),
    },
  });
}

function errorState(error: unknown, query: string): WorkspaceState {
  if (error instanceof DataError) {
    if (error.code === "alphafold_unavailable" || error.code === "alphafold_mapping_unsupported") {
      return { status: "unsupported", message: error.message, query };
    }
    return { status: "error", message: error.message, query };
  }
  return { status: "error", message: "Something went wrong while loading this protein.", query };
}

export function currentShareUrl(origin: string, greenfold: string, pathname = "/"): string {
  return shareUrl(origin, greenfold, pathname);
}

export function exportBundle(state: ReadyState) {
  const accession = state.protein.accession;
  const sequence = state.derived.minifiedSequence;
  const cofolding = Object.fromEntries(
    COFOLDING_EXPORTS.map((item) => [item.id, item.content(accession, sequence)]),
  );
  return {
    fasta: exportFasta(state.protein, sequence, state.derived.editCount),
    csv: exportResidueMapCsv(state.derived.residueMap),
    af3: cofolding.af3,
    boltz: cofolding.boltz,
    cofolding,
    algorithmVersion: ALGORITHM_VERSION,
  };
}

export function domainOptions(protein: ProteinRecord): Construct[] {
  const ordered = SELECTABLE_FEATURE_TYPES.flatMap((type) =>
    selectableFeatures(protein).filter((feature) => feature.type === type),
  );
  return [fullLengthConstruct(protein), ...ordered.map(domainConstruct)];
}

export function matchRestoredConstruct(protein: ProteinRecord, restored: Construct): Construct {
  if (restored.kind === "full_length") return fullLengthConstruct(protein);
  if (restored.start === 1 && restored.end === protein.length) return fullLengthConstruct(protein);
  const selectable = selectableFeatures(protein);
  const exact = selectable.find(
    (feature) => feature.start === restored.start && feature.end === restored.end,
  );
  if (exact) return domainConstruct(exact);
  const coveringDomains = protein.features.filter(
    (feature) =>
      feature.type === "domain" && feature.start >= restored.start && feature.end <= restored.end,
  );
  if (coveringDomains.length > 0) {
    const span = spanDomainConstruct(coveringDomains);
    if (span.start === restored.start && span.end === restored.end) return span;
  }
  return { ...restored, kind: restored.kind === "restored_final" ? "restored_final" : "domain" };
}

export { ALGORITHM_VERSION };
