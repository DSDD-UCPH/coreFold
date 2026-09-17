export const DESIGN_HISTORY_KEY = "protein-minifier.design-history.v1";
export const WORKING_DESIGN_KEY = "protein-minifier.working-design-id";
export const DESIGN_HISTORY_LIMIT = 25;

export type DesignHistoryEntry = {
  id: string;
  accession: string;
  gene?: string;
  label: string;
  greenfold: string;
  savedAt: number;
  minifiedLength: number;
  gain: string;
  saved: boolean;
};

export type DesignPayload = Omit<DesignHistoryEntry, "id" | "savedAt" | "saved">;

function localStore(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readDesignHistory(): DesignHistoryEntry[] {
  const raw = localStore()?.getItem(DESIGN_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DesignHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry) =>
          typeof entry?.id === "string" &&
          typeof entry.accession === "string" &&
          typeof entry.greenfold === "string" &&
          typeof entry.savedAt === "number",
      )
      .map((entry) => ({ ...entry, saved: entry.saved === true }));
  } catch {
    return [];
  }
}

export function writeDesignHistory(entries: DesignHistoryEntry[]): DesignHistoryEntry[] {
  const next = entries.slice(0, DESIGN_HISTORY_LIMIT);
  localStore()?.setItem(DESIGN_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function getWorkingDesignId(): string | undefined {
  return sessionStore()?.getItem(WORKING_DESIGN_KEY) || undefined;
}

export function setWorkingDesignId(id?: string) {
  const session = sessionStore();
  if (!session) return;
  if (!id) session.removeItem(WORKING_DESIGN_KEY);
  else session.setItem(WORKING_DESIGN_KEY, id);
}

function newDesignId(): string {
  return `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function upsertWorkingDesign(payload: DesignPayload): DesignHistoryEntry[] {
  const savedAt = Date.now();
  const list = readDesignHistory();
  const workingId = getWorkingDesignId();
  const existing = workingId ? list.find((entry) => entry.id === workingId) : undefined;
  if (existing && existing.accession === payload.accession) {
    const updated: DesignHistoryEntry = { ...existing, ...payload, savedAt, saved: false };
    return writeDesignHistory([updated, ...list.filter((entry) => entry.id !== existing.id)]);
  }
  if (
    list.some(
      (entry) =>
        entry.saved &&
        entry.accession === payload.accession &&
        entry.greenfold === payload.greenfold,
    )
  ) {
    return list;
  }
  const id = newDesignId();
  setWorkingDesignId(id);
  const created: DesignHistoryEntry = { ...payload, id, savedAt, saved: false };
  return writeDesignHistory([created, ...list]);
}

export function saveWorkingDesign(payload?: DesignPayload): DesignHistoryEntry[] {
  const list = payload ? upsertWorkingDesign(payload) : readDesignHistory();
  const workingId = getWorkingDesignId();
  if (!workingId) return list;
  const savedAt = Date.now();
  const next = writeDesignHistory(
    list.map((entry) => (entry.id === workingId ? { ...entry, saved: true, savedAt } : entry)),
  );
  setWorkingDesignId(undefined);
  return next;
}

export function deleteDesign(id: string): DesignHistoryEntry[] {
  if (getWorkingDesignId() === id) setWorkingDesignId(undefined);
  return writeDesignHistory(readDesignHistory().filter((entry) => entry.id !== id));
}

export function clearDesignHistory(): DesignHistoryEntry[] {
  setWorkingDesignId(undefined);
  return writeDesignHistory([]);
}
