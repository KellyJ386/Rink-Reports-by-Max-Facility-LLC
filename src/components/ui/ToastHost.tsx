"use client";

import { useState, useEffect, useCallback } from "react";
import { subscribe, type Toast } from "@/lib/toast";

const MAX_VISIBLE = 3;

function toastBg(kind: Toast["kind"]): string {
  switch (kind) {
    case "success":
      return "bg-[var(--color-brand-green)] text-white";
    case "error":
      return "bg-[var(--color-brand-red)] text-white";
    default:
      return "bg-[var(--color-brand-navy)] text-white";
  }
}

export function ToastHost() {
  const [visible, setVisible] = useState<Toast[]>([]);
  const [backlog, setBacklog] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setVisible((prev) => {
      const next = prev.filter((t) => t.id !== id);
      return next;
    });
    // Pull from backlog after removal
    setBacklog((bl) => {
      if (bl.length === 0) return bl;
      const [next, ...rest] = bl;
      setVisible((v) => (v.length < MAX_VISIBLE ? [...v, next] : v));
      return rest;
    });
  }, []);

  useEffect(() => {
    return subscribe((toast) => {
      setVisible((prev) => {
        if (prev.length < MAX_VISIBLE) {
          return [...prev, toast];
        }
        setBacklog((bl) => [...bl, toast]);
        return prev;
      });
    });
  }, []);

  // Schedule removal for each toast
  useEffect(() => {
    if (visible.length === 0) return;
    const last = visible[visible.length - 1];
    const timer = setTimeout(() => {
      removeToast(last.id);
    }, last.durationMs ?? 3000);
    return () => clearTimeout(timer);
  }, [visible, removeToast]);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {visible.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`rounded-lg px-4 py-3 shadow-lg transition-opacity opacity-100 ${toastBg(toast.kind)}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
