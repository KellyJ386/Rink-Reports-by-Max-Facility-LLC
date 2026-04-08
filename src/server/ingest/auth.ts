import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export interface VerifiedDevice {
  deviceId: string;
  facilityId: string;
  deviceType:
    | "refrigeration_controller"
    | "air_quality_sensor"
    | "ice_depth_sensor";
}

const MAX_CLOCK_SKEW_SECONDS = 300;

/**
 * Verifies an ingest request's HMAC signature and returns device info.
 *
 * Security model:
 *   1. Replay protection: X-Timestamp must be within 300 seconds of now.
 *   2. HMAC verification: The signature covers deviceId + timestamp + SHA-256(body).
 *      The HMAC key is: INGEST_SIGNING_SECRET + hashed_secret (from DB).
 *      hashed_secret = SHA-256(plaintext_device_secret).
 *      This means a DB leak alone cannot forge signatures — INGEST_SIGNING_SECRET
 *      (server-side env var) is also required.
 *   3. Timing-safe comparison via crypto.timingSafeEqual.
 *
 * Returns null on any verification failure (missing headers, clock skew,
 * unknown device, inactive device, bad signature).
 */
export async function verifyDeviceRequest(
  req: Request,
  rawBody: string,
  supabase: SupabaseClient<Database>,
): Promise<VerifiedDevice | null> {
  const deviceId = req.headers.get("x-device-id");
  const timestamp = req.headers.get("x-timestamp");
  const signature = req.headers.get("x-signature");
  if (!deviceId || !timestamp || !signature) return null;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_CLOCK_SKEW_SECONDS) return null;

  const { data: device } = await supabase
    .from("device_credentials")
    .select("device_id, facility_id, device_type, hashed_secret, is_active")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!device || !device.is_active) return null;

  // HMAC construction:
  //   message = "<deviceId>.<timestamp>.<sha256(rawBody)>"
  //   key     = INGEST_SIGNING_SECRET + hashed_secret
  //   hashed_secret = SHA-256(plaintext_device_secret) — stored in DB
  //
  // The device signs with:
  //   HMAC-SHA256(key, message)  where key = INGEST_SIGNING_SECRET + SHA256(plaintext)
  //
  // This arrangement means:
  //   - DB leak alone: attacker has hashed_secret but not INGEST_SIGNING_SECRET → cannot forge
  //   - INGEST_SIGNING_SECRET leak alone: attacker has server key but not device secret → cannot forge
  //   - Both required to reproduce the exact HMAC key
  const bodyHash = crypto
    .createHash("sha256")
    .update(rawBody)
    .digest("hex");
  const message = `${deviceId}.${timestamp}.${bodyHash}`;
  const baseKey =
    (process.env.INGEST_SIGNING_SECRET ?? "") + device.hashed_secret;
  const expected = crypto
    .createHmac("sha256", baseKey)
    .update(message)
    .digest("hex");

  // Timing-safe comparison prevents timing oracle attacks
  const expectedBuf = Buffer.from(expected, "hex");
  let actualBuf: Buffer;
  try {
    actualBuf = Buffer.from(signature, "hex");
  } catch {
    return null;
  }
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

  // Update last_seen_at best-effort — don't await, don't block ingest
  void supabase
    .from("device_credentials")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("device_id", deviceId);

  return {
    deviceId: device.device_id,
    facilityId: device.facility_id,
    deviceType: device.device_type as VerifiedDevice["deviceType"],
  };
}

/**
 * Computes the SHA-256 hex digest of a plaintext device secret.
 * This is what gets stored in device_credentials.hashed_secret.
 * bcrypt is listed as a dep for future portability; Phase E uses
 * SHA-256 to keep HMAC key derivation deterministic.
 */
export function hashDeviceSecret(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Generates a cryptographically random device secret (32 bytes → base64url).
 * Shown once during device provisioning; never stored in plaintext.
 */
export function generateDeviceSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}
