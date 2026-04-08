import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type SyncRecord = {
  localId: string;
  table: string;
  payload: unknown;
  retryCount: number;
};

export type SyncContext = {
  facilityId: string;
  userId: string;
  supabase: SupabaseClient<Database>;
};

export type SyncResultRow = {
  localId: string;
  serverId?: string | null;
  error?: string | null;
};

export type SyncHandler = {
  table: string;
  handle: (record: SyncRecord, ctx: SyncContext) => Promise<SyncResultRow>;
};
