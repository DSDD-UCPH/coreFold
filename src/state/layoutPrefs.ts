export const LAYOUT_STORAGE_KEY = "protein-minifier.layout.v1";

export type LayoutPrefs = {
  inspectorWidth: number;
  dockHeight: number;
  dockCollapsed: boolean;
};

export const DEFAULT_LAYOUT: LayoutPrefs = {
  inspectorWidth: 380,
  dockHeight: 280,
  dockCollapsed: false,
};

export function readLayoutPrefs(): LayoutPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;
    return {
      inspectorWidth: clamp(parsed.inspectorWidth ?? DEFAULT_LAYOUT.inspectorWidth, 280, 640),
      dockHeight: clamp(parsed.dockHeight ?? DEFAULT_LAYOUT.dockHeight, 160, 640),
      dockCollapsed: Boolean(parsed.dockCollapsed),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function writeLayoutPrefs(prefs: LayoutPrefs) {
  try {
    globalThis.localStorage?.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota or private-mode failures.
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
