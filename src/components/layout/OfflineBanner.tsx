"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `navigator.onLine` via window listeners. SSR-safe: starts as
 * `true` (assume online) so the server-rendered output and the first
 * client render agree, then updates inside useEffect.
 */
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}

/**
 * Sticky top banner that appears whenever the browser reports it is
 * offline. Returns null when online — no layout shift while connected.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 w-full px-4 py-2 text-center text-sm font-medium text-white"
      style={{ backgroundColor: "var(--color-brand-yellow)" }}
    >
      You are offline. Changes will sync automatically when the connection
      returns.
    </div>
  );
}
