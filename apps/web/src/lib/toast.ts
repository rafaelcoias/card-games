import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (text, tone = 'info') => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => get().dismiss(id), tone === 'error' ? 5000 : 3200);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (text: string) => useToasts.getState().push(text, 'info'),
  success: (text: string) => useToasts.getState().push(text, 'success'),
  error: (text: string) => useToasts.getState().push(text, 'error'),
};
