export type ToastTone = "error" | "success" | "info";
export interface ToastItem { id: number; message: string; tone: ToastTone; }

type Listener = (items: ToastItem[]) => void;
export let items: ToastItem[] = [];
let seq = 0;
export const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l(items));

export function toast(message: string, tone: ToastTone = "info", ttl = 4500) {
  const id = ++seq;
  items = [...items, { id, message, tone }];
  emit();
  window.setTimeout(() => dismiss(id), ttl);
}
export const toastError = (message: string) => toast(message, "error", 6000);
export const toastSuccess = (message: string) => toast(message, "success");

export function dismiss(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}

