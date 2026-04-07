"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { createSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Branding & Display — section 10 of the Admin Control Center.
 *
 * Logo upload + three brand colors + optional PDF header text
 * override. Logo files are uploaded directly from the browser to
 * the private 'branding' Storage bucket under
 * `<facility_id>/<filename>`; only the resulting object path is
 * stored in facility_branding.logo_path. The card lazy-fetches a
 * 5-minute signed URL via admin.branding.signLogoUrl to render
 * the current logo.
 */
export function BrandingDisplayCard() {
  const utils = trpc.useUtils();
  const branding = trpc.admin.branding.get.useQuery();
  const me = trpc.admin.me.useQuery();
  const logoUrl = trpc.admin.branding.signLogoUrl.useQuery();
  const save = trpc.admin.branding.save.useMutation({
    onSuccess: () => {
      utils.admin.branding.get.invalidate();
      utils.admin.branding.signLogoUrl.invalidate();
      setStatus("saved");
    },
    onError: (err) => {
      setStatus("error");
      setErrorMsg(err.message);
    },
  });

  const [status, setStatus] = useState<"idle" | "saved" | "error" | "uploading">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (branding.isLoading || me.isLoading) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Branding &amp; display</h2>
        <p className="mt-2 text-sm text-grey">Loading…</p>
      </section>
    );
  }
  if (branding.error) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Branding &amp; display</h2>
        <p className="mt-2 text-sm text-red">{branding.error.message}</p>
      </section>
    );
  }

  const initial = branding.data!;

  return (
    <BrandingForm
      key={JSON.stringify(initial)}
      initial={initial}
      facilityId={me.data?.facility_id ?? ""}
      currentLogoUrl={logoUrl.data?.url ?? null}
      status={status}
      errorMsg={errorMsg}
      onStatus={(s) => {
        setStatus(s);
        if (s !== "error") setErrorMsg(null);
      }}
      onError={(m) => {
        setStatus("error");
        setErrorMsg(m);
      }}
      isSaving={save.isPending}
      onSave={(patch) => save.mutate(patch)}
    />
  );
}

function BrandingForm({
  initial,
  facilityId,
  currentLogoUrl,
  status,
  errorMsg,
  onStatus,
  onError,
  isSaving,
  onSave,
}: {
  initial: {
    logo_path: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    pdf_header_text: string | null;
  };
  facilityId: string;
  currentLogoUrl: string | null;
  status: "idle" | "saved" | "error" | "uploading";
  errorMsg: string | null;
  onStatus: (s: "idle" | "saved" | "error" | "uploading") => void;
  onError: (m: string) => void;
  isSaving: boolean;
  onSave: (patch: {
    logo_path?: string | null;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    pdf_header_text?: string | null;
  }) => void;
}) {
  const [primary, setPrimary] = useState(initial.primary_color);
  const [secondary, setSecondary] = useState(initial.secondary_color);
  const [accent, setAccent] = useState(initial.accent_color);
  const [headerText, setHeaderText] = useState(initial.pdf_header_text ?? "");

  async function onLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!facilityId) {
      onError("Could not resolve facility id");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onError("Logo must be 2 MB or smaller");
      return;
    }

    onStatus("uploading");

    // Upload to <facility_id>/logo-<timestamp>.<ext> so the path is
    // stable per upload and the bucket RLS policy can scope by the
    // first folder segment.
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${facilityId}/logo-${Date.now()}.${ext}`;

    const supabase = createSupabaseBrowserClient();
    const { error: uploadErr } = await supabase.storage
      .from("branding")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadErr) {
      onError(`Upload failed: ${uploadErr.message}`);
      return;
    }

    // Persist the new path on the branding row.
    onSave({ logo_path: path });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      primary_color: primary,
      secondary_color: secondary,
      accent_color: accent,
      pdf_header_text: headerText.trim() === "" ? null : headerText.trim(),
    });
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Branding &amp; display</h2>
      <p className="mt-1 text-sm text-grey">
        Upload your facility logo, pick a color theme, and customize
        the header text used on every generated PDF report.
      </p>

      {/* ---- Logo upload --------------------------------------- */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-40 items-center justify-center rounded border border-grey/30 bg-darkbg">
          {currentLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentLogoUrl}
              alt="Facility logo"
              className="max-h-20 max-w-36 object-contain"
            />
          ) : (
            <span className="text-xs text-grey">No logo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-grey">Logo (PNG, JPG, or SVG; max 2 MB)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={onLogoChange}
            disabled={status === "uploading" || isSaving}
            className="text-sm text-grey file:mr-3 file:rounded file:border file:border-grey/40 file:bg-darkbg file:px-3 file:py-1.5 file:text-xs file:text-white"
          />
          {status === "uploading" && (
            <span className="text-xs text-grey">Uploading…</span>
          )}
        </div>
      </div>

      {/* ---- Colors + header text ------------------------------ */}
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="col-span-full text-xs uppercase tracking-wide text-grey">
            Color theme
          </legend>
          <ColorField label="Primary" value={primary} onChange={setPrimary} />
          <ColorField label="Secondary" value={secondary} onChange={setSecondary} />
          <ColorField label="Accent" value={accent} onChange={setAccent} />
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">PDF header text override (optional)</span>
          <input
            type="text"
            maxLength={500}
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            placeholder="Defaults to facility name"
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>

        {status === "saved" && <p className="text-sm text-green">Saved.</p>}
        {status === "error" && errorMsg && (
          <p className="text-sm text-red">{errorMsg}</p>
        )}

        <div>
          <button
            type="submit"
            disabled={isSaving || status === "uploading"}
            className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save branding"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-grey">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 cursor-pointer rounded border border-grey/40 bg-darkbg"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
          className="w-24 rounded border border-grey/40 bg-darkbg px-2 py-1 font-mono text-xs text-white focus:border-navy focus:outline-none"
        />
      </div>
    </label>
  );
}
