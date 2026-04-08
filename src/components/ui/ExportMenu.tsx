"use client";

import { useEffect, useRef, useState } from "react";

export interface ExportMenuProps {
  onExportPdf?: () => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  isExporting: boolean;
}

export function ExportMenu({
  onExportPdf,
  onExportCsv,
  onExportXlsx,
  isExporting,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when user clicks outside
  useEffect(() => {
    if (!open) return;

    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  function handleOption(handler: () => void) {
    setOpen(false);
    handler();
  }

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      {/* Trigger button */}
      <button
        type="button"
        disabled={isExporting}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#003B6F] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#002d54] focus:outline-none focus:ring-2 focus:ring-[#003B6F] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {isExporting ? (
          <>
            {/* Spinner */}
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Exporting…
          </>
        ) : (
          <>
            Export
            {/* Chevron */}
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 z-10 mt-2 w-44 origin-top-right rounded-md border border-[#A5ACAF]/30 bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="py-1">
            {onExportPdf && (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleOption(onExportPdf)}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#003B6F]"
              >
                {/* PDF icon */}
                <svg
                  className="h-4 w-4 text-[#F42A2A]"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-1h8v1H8zm0-3v-1h5v1H8zm0-3V10h8v1H8z" />
                </svg>
                Download PDF
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => handleOption(onExportCsv)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#003B6F]"
            >
              {/* CSV icon */}
              <svg
                className="h-4 w-4 text-[#4DFF00]"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V10h12v10H6zm2-6h8v1H8v-1zm0-2h8v1H8v-1z" />
              </svg>
              Download CSV
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => handleOption(onExportXlsx)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#003B6F]"
            >
              {/* Excel icon */}
              <svg
                className="h-4 w-4 text-[#003B6F]"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9 17l2-3-2-3h1.5l1.25 2 1.25-2H14.5l-2 3 2 3H13l-1.25-2-1.25 2H9z" />
              </svg>
              Download Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
