"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  Header,
  Sidebar,
  MobileNav,
  OfflineBanner,
  SyncProvider,
  type NavItem,
  type SyncStatusValue,
} from "@/components/layout";
import { ToastHost } from "@/components/ui/ToastHost";

export type DashboardShellProps = {
  facilityName: string;
  userName: string;
  navItems: NavItem[];
  children: ReactNode;
  /**
   * Optional slot rendered to the right of the Header (e.g. SignOut
   * button). Kept as a slot so the server layout can pass server- or
   * client-rendered actions without DashboardShell knowing about auth.
   */
  headerActions?: ReactNode;
  /**
   * Phase A: wired to plausible defaults. Real values will come from
   * the Dexie sync engine in a later phase.
   */
  syncStatus?: SyncStatusValue;
  pendingCount?: number;
};

/**
 * Client wrapper for the dashboard chrome. Owns the mobile-menu open
 * state and renders the Header / Sidebar / MobileNav / OfflineBanner
 * around `children`. The server layout fetches user/facility data and
 * passes it down to this shell so the wrapper itself stays a Server
 * Component (per CLAUDE.md auth gating in the layout).
 */
export function DashboardShell({
  facilityName,
  userName,
  navItems,
  children,
  syncStatus = "synced",
  pendingCount = 0,
  headerActions,
}: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname() ?? "";

  return (
    <SyncProvider>
    <div className="flex min-h-full flex-1 flex-col">
      <OfflineBanner />
      <Header
        facilityName={facilityName}
        userName={userName}
        syncStatus={syncStatus}
        pendingCount={pendingCount}
        onMenuToggle={() => setMobileNavOpen((v) => !v)}
      />
      {headerActions && (
        <div className="flex items-center justify-end gap-3 border-b border-grey/30 bg-darkbg px-4 py-2 sm:px-6">
          {headerActions}
        </div>
      )}
      <div className="flex flex-1">
        <Sidebar navItems={navItems} activePath={pathname} />
        <main className="flex-1">{children}</main>
      </div>
      <MobileNav
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        navItems={navItems}
      />
      <ToastHost />
    </div>
    </SyncProvider>
  );
}
