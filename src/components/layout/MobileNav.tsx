"use client";

import Link from "next/link";
import type { NavItem } from "./Sidebar";

export type MobileNavProps = {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavItem[];
};

/**
 * Full-screen drawer for narrow viewports. Slides in from the left.
 * Backdrop tap closes; nav item taps also close.
 */
export function MobileNav({ isOpen, onClose, navItems }: MobileNavProps) {
  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close navigation menu"
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Panel */}
      <aside
        className={`absolute left-0 top-0 h-full w-72 max-w-[85%] border-r border-grey/30 bg-darkbg shadow-xl transition-transform duration-200 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-grey/30 px-4 py-3">
          <span
            className="text-base font-semibold"
            style={{ color: "var(--color-brand-navy)" }}
          >
            RinkReports
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-grey hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-2 rounded px-3 py-2 text-sm text-grey hover:bg-white/5 hover:text-white"
            >
              {item.icon && (
                <span className="inline-flex h-4 w-4 items-center justify-center">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}
