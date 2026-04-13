"use client";

interface Props {
  isLocked: boolean;
  isManager: boolean;
  onUnlock: () => void;
}

/**
 * Yellow banner shown when the schedule is_locked.
 * Displays a warning message and an "Unlock" button for admins/managers.
 */
export function ScheduleLockBanner({ isLocked, isManager, onUnlock }: Props) {
  if (!isLocked) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-yellow/40 bg-yellow/10 px-4 py-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-5 w-5 shrink-0 text-yellow"
      >
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
          clipRule="evenodd"
        />
      </svg>
      <p className="text-sm text-yellow">
        This schedule is locked. Changes are disabled.
      </p>
      {isManager && (
        <button
          type="button"
          onClick={onUnlock}
          className="ml-auto flex h-11 items-center rounded border border-yellow/60 px-3 py-1.5 text-sm text-yellow hover:bg-yellow/20"
        >
          Unlock
        </button>
      )}
    </div>
  );
}
