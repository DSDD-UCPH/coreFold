import { create } from "zustand";

export type DragPreview = {
  construct?: { start: number; end: number };
  edit?: { id: string; start: number; end: number };
};

export type HoverRange = {
  start: number;
  end: number;
};

export type ToastMessage = {
  text: string;
  at: number;
};

type InteractionStore = {
  dragPreview?: DragPreview;
  hoverRange?: HoverRange;
  toast?: ToastMessage;
  setDragPreview: (preview?: DragPreview) => void;
  setHoverRange: (range?: HoverRange) => void;
  setToast: (text?: string) => void;
};

export const useInteractionStore = create<InteractionStore>((set) => ({
  setDragPreview: (dragPreview) => set({ dragPreview }),
  setHoverRange: (hoverRange) => set({ hoverRange }),
  setToast: (text) => set({ toast: text ? { text, at: Date.now() } : undefined }),
}));

export function notifyCommit(text: string) {
  useInteractionStore.getState().setToast(text);
}
