"use client";

import { useEffect, useRef } from "react";

import { trpc } from "@/lib/trpc";

interface Props {
  positionId: string;
  date: string;
  startTime: string;
  endTime: string;
  currentUserId: string | null;
  onAssign: (userId: string | null) => void;
  onClose: () => void;
}

/**
 * Dropdown to assign an employee to a shift cell. Shows eligible employees
 * with availability status indicators. Clicking outside or pressing Escape
 * closes the dropdown.
 */
export function ShiftAssignmentDropdown({
  positionId: _positionId,
  date: _date,
  startTime: _startTime,
  endTime: _endTime,
  currentUserId,
  onAssign,
  onClose,
}: Props) {
  const roster = trpc.scheduling.listRoster.useQuery();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const employees = roster.data ?? [];

  return (
    <div
      ref={ref}
      className="absolute z-30 mt-1 w-56 rounded-lg border border-grey/30 bg-darkbg shadow-lg"
    >
      <div className="max-h-64 overflow-y-auto p-1">
        {/* Unassign option */}
        <button
          type="button"
          onClick={() => onAssign(null)}
          className="flex h-11 w-full items-center rounded px-3 py-2 text-left text-sm text-grey hover:bg-darkbg/80 hover:text-white"
        >
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-grey/40" />
          Unassign
        </button>

        {roster.isLoading && (
          <p className="px-3 py-2 text-xs text-grey">Loading...</p>
        )}

        {employees.map((emp) => {
          const isCurrentlyAssigned = emp.user_id === currentUserId;
          return (
            <button
              key={emp.user_id}
              type="button"
              onClick={() => onAssign(emp.user_id)}
              className={`flex h-11 w-full items-center rounded px-3 py-2 text-left text-sm hover:bg-darkbg/80 ${
                isCurrentlyAssigned
                  ? "font-medium text-green"
                  : "text-white"
              }`}
            >
              {isCurrentlyAssigned && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="mr-2 h-4 w-4 text-green"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <span className="truncate">
                {emp.full_name ?? emp.user_id}
              </span>
            </button>
          );
        })}

        {!roster.isLoading && employees.length === 0 && (
          <p className="px-3 py-2 text-xs text-grey">No staff available.</p>
        )}
      </div>
    </div>
  );
}
