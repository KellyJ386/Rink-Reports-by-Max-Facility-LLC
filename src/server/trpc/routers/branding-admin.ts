import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { requireAdmin } from "@/server/trpc/routers/admin";

/**
 * Branding & Display admin sub-router (mounted at admin.branding).
 *
 * Stores logo path (in the 'branding' Storage bucket — uploads happen
 * client-side via supabase-js, this router just records the path),
 * three brand colors, and the optional PDF header text override.
 *
 * Reads also work for non-admins (so module PDFs / page headers can
 * style themselves), but only admin+ can write.
 */

const HEX = /^#[0-9A-Fa-f]{6}$/;

const SaveBrandingInput = z.object({
  logo_path:        z.string().max(500).nullable().optional(),
  primary_color:    z.string().regex(HEX).optional(),
  secondary_color:  z.string().regex(HEX).optional(),
  accent_color:     z.string().regex(HEX).optional(),
  pdf_header_text:  z.string().max(500).nullable().optional(),
});

export const brandingAdminRouter = router({
  /**
   * Get the branding row, returning sane defaults if no row exists
   * yet (every facility starts with the navy/grey/green default
   * palette and no logo).
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("facility_branding")
      .select("logo_path, primary_color, secondary_color, accent_color, pdf_header_text")
      .eq("facility_id", ctx.facilityId)
      .maybeSingle();
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return (
      data ?? {
        logo_path: null,
        primary_color: "#003B6F",
        secondary_color: "#A5ACAF",
        accent_color: "#4DFF00",
        pdf_header_text: null,
      }
    );
  }),

  /**
   * Upsert the branding row. Always inserts on conflict so a single
   * mutation flow covers both first-save and subsequent edits. Admin
   * only.
   */
  save: protectedProcedure
    .input(SaveBrandingInput)
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);

      // Read existing first so we don't clobber colors when only
      // logo_path is set, etc.
      const { data: existing } = await ctx.supabase
        .from("facility_branding")
        .select("logo_path, primary_color, secondary_color, accent_color, pdf_header_text")
        .eq("facility_id", ctx.facilityId)
        .maybeSingle();

      const merged = {
        facility_id: ctx.facilityId,
        logo_path:        input.logo_path        ?? existing?.logo_path        ?? null,
        primary_color:    input.primary_color    ?? existing?.primary_color    ?? "#003B6F",
        secondary_color:  input.secondary_color  ?? existing?.secondary_color  ?? "#A5ACAF",
        accent_color:     input.accent_color     ?? existing?.accent_color     ?? "#4DFF00",
        pdf_header_text:  input.pdf_header_text  ?? existing?.pdf_header_text  ?? null,
      };

      const { error } = await ctx.supabase
        .from("facility_branding")
        .upsert(merged, { onConflict: "facility_id" });
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  /**
   * Sign a 5-minute Storage URL for the current logo so the admin
   * card and module headers can render it. Returns null if no logo
   * is set.
   */
  signLogoUrl: protectedProcedure.query(async ({ ctx }) => {
    const { data: row } = await ctx.supabase
      .from("facility_branding")
      .select("logo_path")
      .eq("facility_id", ctx.facilityId)
      .maybeSingle();
    if (!row?.logo_path) return { url: null as string | null };

    const { data: signed, error } = await ctx.supabase.storage
      .from("branding")
      .createSignedUrl(row.logo_path, 300);
    if (error || !signed?.signedUrl) {
      return { url: null };
    }
    return { url: signed.signedUrl };
  }),
});
