"use client";

import { useState, useEffect } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = any;

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (localStorage.getItem("rr_install_dismissed") === "1") {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) {
    return null;
  }

  if (!promptEvent || dismissed) {
    return null;
  }

  function handleInstall() {
    if (!promptEvent) return;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    promptEvent.prompt();
    setPromptEvent(null);
  }

  function handleDismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem("rr_install_dismissed", "1");
    }
    setDismissed(true);
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
      style={{
        backgroundColor: "var(--color-brand-navy)",
        borderBottom: "1px solid rgba(165, 172, 175, 0.3)",
      }}
    >
      <span className="text-white">Add RinkReports to your home screen</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleInstall}
          className="rounded px-3 py-1 font-semibold text-sm"
          style={{
            backgroundColor: "var(--color-brand-green)",
            color: "var(--color-brand-navy)",
          }}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="rounded px-3 py-1 font-semibold text-sm border"
          style={{
            borderColor: "rgba(165, 172, 175, 0.5)",
            color: "#A5ACAF",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
