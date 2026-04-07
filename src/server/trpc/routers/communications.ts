import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { SendMessageInput } from "@/modules/communications/schema";

/**
 * Communications router. Handles sending messages, listing the
 * caller's inbox/sent, marking messages read, and producing a signed
 * URL for the recipient to download an attached PDF from the
 * 'communications' Storage bucket.
 *
 * Storage uploads happen client-side directly to Supabase Storage
 * (using the supabase-js client) so the message tRPC procedure only
 * needs the resulting object path. The bucket has its own RLS
 * policies that gate read access to message participants.
 */

export interface ListMessagesRow {
  id: string;
  subject: string;
  body: string;
  sender_id: string;
  attachment_path: string | null;
  attachment_label: string | null;
  sent_at: string;
  read_at: string | null;
}

export const communicationsRouter = router({
  // -------------------------------------------------------------------
  // Inbox: messages where the caller is a recipient.
  // -------------------------------------------------------------------
  listInbox: protectedProcedure.query(
    async ({ ctx }): Promise<ListMessagesRow[]> => {
      const { data, error } = await ctx.supabase
        .from("message_recipients")
        .select(
          "read_at, messages!inner(id, subject, body, sender_id, attachment_path, attachment_label, sent_at, facility_id)",
        )
        .eq("user_id", ctx.user.id)
        .eq("messages.facility_id", ctx.facilityId)
        .order("messages(sent_at)", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return (data ?? []).map((row) => {
        // The `messages` join returns either a single object or an
        // array depending on relation cardinality; supabase-js types
        // it as an object for !inner.
        const m = row.messages as unknown as {
          id: string;
          subject: string;
          body: string;
          sender_id: string;
          attachment_path: string | null;
          attachment_label: string | null;
          sent_at: string;
        };
        return {
          id: m.id,
          subject: m.subject,
          body: m.body,
          sender_id: m.sender_id,
          attachment_path: m.attachment_path,
          attachment_label: m.attachment_label,
          sent_at: m.sent_at,
          read_at: row.read_at,
        };
      });
    },
  ),

  // -------------------------------------------------------------------
  // Sent: messages the caller authored.
  // -------------------------------------------------------------------
  listSent: protectedProcedure.query(
    async ({ ctx }): Promise<ListMessagesRow[]> => {
      const { data, error } = await ctx.supabase
        .from("messages")
        .select(
          "id, subject, body, sender_id, attachment_path, attachment_label, sent_at",
        )
        .eq("facility_id", ctx.facilityId)
        .eq("sender_id", ctx.user.id)
        .order("sent_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return (data ?? []).map((m) => ({
        id: m.id,
        subject: m.subject,
        body: m.body,
        sender_id: m.sender_id,
        attachment_path: m.attachment_path,
        attachment_label: m.attachment_label,
        sent_at: m.sent_at,
        read_at: null,
      }));
    },
  ),

  // -------------------------------------------------------------------
  // Send: insert the message + recipient rows in one transaction-ish
  // sequence.
  // -------------------------------------------------------------------
  send: protectedProcedure
    .input(SendMessageInput)
    .mutation(async ({ ctx, input }) => {
      // Verify every recipient_id is in the caller's facility.
      const { data: validUsers, error: usersErr } = await ctx.supabase
        .from("user_profiles")
        .select("user_id")
        .eq("facility_id", ctx.facilityId)
        .in("user_id", input.recipient_ids);
      if (usersErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: usersErr.message,
        });
      }
      const validIds = new Set((validUsers ?? []).map((u) => u.user_id));
      const filtered = input.recipient_ids.filter((id) => validIds.has(id));
      if (filtered.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No valid recipients in this facility",
        });
      }

      const { data: msg, error: msgErr } = await ctx.supabase
        .from("messages")
        .insert({
          facility_id: ctx.facilityId,
          sender_id: ctx.user.id,
          subject: input.subject,
          body: input.body,
          attachment_path: input.attachment_path,
          attachment_label: input.attachment_label,
        })
        .select("id")
        .single();

      if (msgErr || !msg) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: msgErr?.message ?? "Failed to send",
        });
      }

      const rows = filtered.map((uid) => ({
        message_id: msg.id,
        user_id: uid,
      }));
      const { error: recErr } = await ctx.supabase
        .from("message_recipients")
        .insert(rows);
      if (recErr) {
        // Best-effort cleanup of the orphaned message.
        await ctx.supabase.from("messages").delete().eq("id", msg.id);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: recErr.message,
        });
      }

      return { id: msg.id };
    }),

  // -------------------------------------------------------------------
  // Mark a message as read by the calling recipient.
  // -------------------------------------------------------------------
  markRead: protectedProcedure
    .input(z.object({ message_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("message_recipients")
        .update({ read_at: new Date().toISOString() })
        .eq("message_id", input.message_id)
        .eq("user_id", ctx.user.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true as const };
    }),

  // -------------------------------------------------------------------
  // Sign a Storage URL for an attached PDF the caller is allowed to
  // download. RLS on storage.objects already restricts the bucket to
  // message participants; the signed URL respects that and is valid
  // for 5 minutes.
  // -------------------------------------------------------------------
  getAttachmentUrl: protectedProcedure
    .input(z.object({ message_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: msg, error: msgErr } = await ctx.supabase
        .from("messages")
        .select("attachment_path, sender_id, facility_id")
        .eq("id", input.message_id)
        .maybeSingle();
      if (msgErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: msgErr.message,
        });
      }
      if (!msg || !msg.attachment_path) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No attachment for this message",
        });
      }

      const { data: signed, error: signErr } = await ctx.supabase.storage
        .from("communications")
        .createSignedUrl(msg.attachment_path, 300);
      if (signErr || !signed?.signedUrl) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: signErr?.message ?? "Could not sign URL",
        });
      }
      return { url: signed.signedUrl };
    }),

  // -------------------------------------------------------------------
  // Listing helpers used by the compose view's "Attach Report"
  // dropdown — exposes a few recent finalized records from each
  // attach-able module so the user doesn't have to memorize ids.
  //
  // For Phase 5 we wire Daily Reports and Ice Depth as the two
  // initial attachables. Other modules can be added by extending
  // this query.
  // -------------------------------------------------------------------
  listAttachableReports: protectedProcedure.query(async ({ ctx }) => {
    const [dailyReports, iceDepthSessions] = await Promise.all([
      ctx.supabase
        .from("daily_reports")
        .select("id, submitted_at, checklist_id")
        .eq("facility_id", ctx.facilityId)
        .order("submitted_at", { ascending: false })
        .limit(20),
      ctx.supabase
        .from("ice_depth_sessions")
        .select("id, submitted_at, template_id, status")
        .eq("facility_id", ctx.facilityId)
        .eq("status", "completed")
        .order("submitted_at", { ascending: false })
        .limit(20),
    ]);

    return {
      daily_reports: dailyReports.data ?? [],
      ice_depth_sessions: iceDepthSessions.data ?? [],
    };
  }),
});
