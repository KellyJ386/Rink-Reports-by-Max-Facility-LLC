"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type NavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
};

export type SidebarProps = {
  navItems: NavItem[];
  activePath: string;
};

/**
 * Desktop sidebar. Hidden below `lg:`. Active item gets a green left
 * border + tinted background — see CLAUDE.md brand tokens.
 */
export function Sidebar({ navItems, activePath }: SidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-grey/30 bg-darkbg lg:flex lg:flex-col">
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map((item) => {
          const isActive =
            activePath === item.href ||
            (item.href !== "/" && activePath.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className="flex items-center gap-2 rounded px-3 py-2 text-sm text-grey transition-colors hover:text-white"
              style={
                isActive
                  ? {
                      borderLeft: "3px solid var(--color-brand-green)",
                      backgroundColor: "rgba(77, 255, 0, 0.08)",
                      color: "#ffffff",
                      paddingLeft: "calc(0.75rem - 3px)",
                    }
                  : undefined
              }
            >
              {item.icon && (
                <span className="inline-flex h-4 w-4 items-center justify-center">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
