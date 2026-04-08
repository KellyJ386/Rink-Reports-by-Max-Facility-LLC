"use client";

import { useState } from "react";
import Link from "next/link";

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop nav */}
      <nav className="flex items-center gap-8">
        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/features"
            className="text-sm font-medium text-grey hover:text-white transition-colors"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-grey hover:text-white transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/demo"
            className="text-sm font-medium text-grey hover:text-white transition-colors"
          >
            Demo
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-grey hover:text-white transition-colors"
          >
            Log In
          </Link>
        </div>

        {/* CTA button — desktop */}
        <Link
          href="/signup"
          className="hidden md:inline-flex items-center rounded-md bg-green px-4 py-2 text-sm font-semibold text-darkbg hover:opacity-90 transition-opacity"
        >
          Start Free Trial
        </Link>

        {/* Hamburger — mobile */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden flex flex-col gap-1.5 p-2"
        >
          <span
            className={`block h-0.5 w-6 bg-white transition-transform origin-center ${open ? "rotate-45 translate-y-2" : ""}`}
          />
          <span
            className={`block h-0.5 w-6 bg-white transition-opacity ${open ? "opacity-0" : ""}`}
          />
          <span
            className={`block h-0.5 w-6 bg-white transition-transform origin-center ${open ? "-rotate-45 -translate-y-2" : ""}`}
          />
        </button>
      </nav>

      {/* Mobile slide-down menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ${open ? "max-h-64 border-t border-white/10" : "max-h-0"}`}
      >
        <div className="flex flex-col gap-1 px-6 py-4">
          <Link
            href="/features"
            className="py-2 text-sm font-medium text-grey hover:text-white transition-colors"
            onClick={() => setOpen(false)}
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="py-2 text-sm font-medium text-grey hover:text-white transition-colors"
            onClick={() => setOpen(false)}
          >
            Pricing
          </Link>
          <Link
            href="/demo"
            className="py-2 text-sm font-medium text-grey hover:text-white transition-colors"
            onClick={() => setOpen(false)}
          >
            Demo
          </Link>
          <Link
            href="/login"
            className="py-2 text-sm font-medium text-grey hover:text-white transition-colors"
            onClick={() => setOpen(false)}
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="mt-2 inline-flex items-center justify-center rounded-md bg-green px-4 py-2 text-sm font-semibold text-darkbg hover:opacity-90 transition-opacity"
            onClick={() => setOpen(false)}
          >
            Start Free Trial
          </Link>
        </div>
      </div>
    </>
  );
}
