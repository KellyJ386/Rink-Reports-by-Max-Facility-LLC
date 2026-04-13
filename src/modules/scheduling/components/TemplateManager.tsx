"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";

interface Props {
  weekIso: string;
  scheduleId: string | null;
  onClose: () => void;
}

/**
 * Modal dialog for schedule template operations:
 * - List saved templates with name + date created
 * - "Save current week as template" form
 * - "Load template" per template (with target week = current weekIso)
 * - "Delete template" with confirmation
 */
export function TemplateManager({ weekIso, scheduleId, onClose }: Props) {
  const utils = trpc.useUtils();
  const templates = trpc.scheduling.listTemplates.useQuery();

  const saveTemplate = trpc.scheduling.saveTemplate.useMutation({
    onSuccess: () => {
      utils.scheduling.listTemplates.invalidate();
      setTemplateName("");
    },
  });

  const loadTemplate = trpc.scheduling.loadTemplate.useMutation({
    onSuccess: () => {
      utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso });
      onClose();
    },
  });

  const deleteTemplate = trpc.scheduling.deleteTemplate.useMutation({
    onSuccess: () => {
      utils.scheduling.listTemplates.invalidate();
    },
  });

  const [templateName, setTemplateName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!templateName.trim()) return;
    saveTemplate.mutate({
      name: templateName.trim(),
      week_start: weekIso,
    });
  }

  function handleLoad(templateId: string) {
    loadTemplate.mutate({
      template_id: templateId,
      week_start: weekIso,
    });
  }

  function handleDelete(templateId: string) {
    deleteTemplate.mutate({ id: templateId });
    setConfirmDeleteId(null);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-grey/30 bg-darkbg p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Schedule Templates
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded border border-grey/40 text-grey hover:border-white hover:text-white"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Save current week as template */}
        {scheduleId && (
          <form
            onSubmit={handleSave}
            className="flex items-end gap-2 rounded border border-grey/20 bg-darkbg/60 p-3"
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-grey">Save current week as template</span>
              <input
                type="text"
                required
                maxLength={200}
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={saveTemplate.isPending || !templateName.trim()}
              className="flex h-11 items-center rounded bg-navy px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saveTemplate.isPending ? "Saving..." : "Save"}
            </button>
          </form>
        )}

        {saveTemplate.error && (
          <p className="text-xs text-red">{saveTemplate.error.message}</p>
        )}

        {/* Template list */}
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-grey">Saved templates</h4>
          {templates.isLoading && (
            <p className="text-xs text-grey">Loading...</p>
          )}
          {templates.data && templates.data.length === 0 && (
            <p className="text-xs text-grey">
              No templates saved yet. Create a schedule and save it as a
              template to reuse it on other weeks.
            </p>
          )}
          {(templates.data ?? []).map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded border border-grey/20 bg-darkbg/60 px-3 py-2"
            >
              <div className="flex flex-1 flex-col">
                <span className="text-sm text-white">{t.name}</span>
                <span className="text-[10px] text-grey">
                  Created{" "}
                  {new Date(t.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleLoad(t.id)}
                  disabled={loadTemplate.isPending}
                  className="flex h-11 items-center rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loadTemplate.isPending ? "Loading..." : "Load"}
                </button>
                {confirmDeleteId === t.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      disabled={deleteTemplate.isPending}
                      className="flex h-11 items-center rounded border border-red/60 px-2 py-1.5 text-xs text-red hover:bg-red/10"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex h-11 items-center rounded border border-grey/40 px-2 py-1.5 text-xs text-grey hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(t.id)}
                    className="flex h-11 items-center rounded border border-red/40 px-2 py-1.5 text-xs text-red hover:border-red hover:bg-red/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {loadTemplate.error && (
          <p className="text-xs text-red">{loadTemplate.error.message}</p>
        )}
        {deleteTemplate.error && (
          <p className="text-xs text-red">{deleteTemplate.error.message}</p>
        )}
      </div>
    </div>
  );
}
