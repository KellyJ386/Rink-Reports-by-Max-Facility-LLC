type ToastKind = "success" | "info" | "error";

export interface ToastInput {
  message: string;
  kind?: ToastKind;
  durationMs?: number;
}

export interface Toast extends ToastInput {
  id: number;
}

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function show(input: ToastInput): void {
  const toast: Toast = { id: nextId++, kind: "info", durationMs: 3000, ...input };
  for (const cb of listeners) cb(toast);
}
