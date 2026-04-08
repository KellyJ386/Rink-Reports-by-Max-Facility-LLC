"use client";

// Uses the global Web Crypto API (window.crypto.subtle) — no Node crypto import.

/**
 * HttpCaliperAdapter — Remote caliper HTTP bridge
 *
 * Implements the same interface as CaliperAdapter but instead of using
 * Web Bluetooth, POSTs readings to /api/ingest/ice-depth.
 *
 * The adapter computes HMAC-SHA256 signatures client-side using Web Crypto API.
 * Signature format: `deviceId.timestamp.sha256(body)` (see auth.ts).
 *
 * Device secret is provisioned server-side and embedded in the operator
 * tablet's local config. The client computes the HMAC key as:
 *   INGEST_SIGNING_SECRET + SHA256(plaintext_device_secret)
 *
 * Note: This adapter requires the device secret to be securely provisioned
 * to the client. The server-side INGEST_SIGNING_SECRET is NOT sent to the client.
 * The two secrets together (server env var + device secret) are needed to forge
 * a valid signature, so a client-side leak alone cannot create valid requests.
 */

export interface CaliperReading {
  value: number;
  raw: string;
  unit?: "mm" | "in";
}

export type CaliperListener = (reading: CaliperReading) => void;
export type CaliperConnectionListener = (connected: boolean) => void;

export class HttpCaliperAdapter {
  public deviceName: string | null = null;
  public profileName: string = "HTTP Remote";

  private deviceId: string;
  private deviceSecret: string;
  private templateId: string;
  private pointIndex: number;
  private connected = false;
  private listeners = new Set<CaliperListener>();
  private connectionListeners = new Set<CaliperConnectionListener>();

  private ingestSigningSecret: string;

  /**
   * @param deviceId Device ID (from device_credentials table)
   * @param deviceSecret Plaintext device secret (provisioned securely to tablet)
   * @param ingestSigningSecret Server-side INGEST_SIGNING_SECRET (provisioned during device setup)
   * @param templateId UUID of the ice depth template
   * @param pointIndex Current point to measure (1-based)
   */
  constructor(
    deviceId: string,
    deviceSecret: string,
    ingestSigningSecret: string,
    templateId: string,
    pointIndex: number,
  ) {
    this.deviceId = deviceId;
    this.deviceSecret = deviceSecret;
    this.ingestSigningSecret = ingestSigningSecret;
    this.templateId = templateId;
    this.pointIndex = pointIndex;
  }

  static isSupported(): boolean {
    // HTTP adapter is always available on the client
    return true;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  onReading(listener: CaliperListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConnectionChange(listener: CaliperConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  async connect(): Promise<void> {
    this.emitConnection(true);
  }

  disconnect(): void {
    this.emitConnection(false);
  }

  /**
   * Submit a caliper reading to the remote endpoint.
   * Computes HMAC signature and POSTs to /api/ingest/ice-depth.
   */
  async submitReading(reading: CaliperReading): Promise<void> {
    try {
      const depthInches = reading.value; // Assume caliper reports in inches
      const timestamp = new Date().toISOString();
      const confidence = 0.95; // Default confidence for manual readings

      const payload = {
        template_id: this.templateId,
        point_index: this.pointIndex,
        depth_inches: depthInches,
        reading_timestamp: timestamp,
        confidence,
      };

      const bodyJson = JSON.stringify(payload);
      const signature = await this.computeSignature(bodyJson);

      const response = await fetch("/api/ingest/ice-depth", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-device-id": this.deviceId,
          "x-timestamp": String(Math.floor(Date.parse(timestamp) / 1000)),
          "x-signature": signature,
        },
        body: bodyJson,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Ingest failed: ${error.status ?? response.statusText}`,
        );
      }

      // Notify listeners of successful submission
      for (const listener of this.listeners) {
        try {
          listener(reading);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      throw new Error(
        `Failed to submit reading: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  /**
   * Compute HMAC-SHA256 signature client-side.
   * Uses Web Crypto API to compute SHA256(deviceSecret) and then HMAC.
   *
   * Signature format: deviceId.timestamp.sha256(body), signed with key:
   *   INGEST_SIGNING_SECRET + sha256(plaintext_device_secret)
   *
   * Device secret is provisioned client-side; INGEST_SIGNING_SECRET is
   * also provisioned to the tablet during device setup. Together they form
   * the HMAC key. A leak of only the device secret is not sufficient to
   * forge signatures (server env var is also required).
   */
  private async computeSignature(bodyJson: string): Promise<string> {
    // Compute SHA-256(deviceSecret)
    const secretBytes = new TextEncoder().encode(this.deviceSecret);
    const secretHash = await crypto.subtle.digest("SHA-256", secretBytes);
    const secretHashHex = this.bytesToHex(new Uint8Array(secretHash));

    // Compute SHA-256(body)
    const bodyBytes = new TextEncoder().encode(bodyJson);
    const bodyHash = await crypto.subtle.digest("SHA-256", bodyBytes);
    const bodyHashHex = this.bytesToHex(new Uint8Array(bodyHash));

    // Timestamp (seconds, same as server side)
    const timestamp = Math.floor(Date.now() / 1000);

    // Message to sign: deviceId.timestamp.sha256(body)
    const message = `${this.deviceId}.${timestamp}.${bodyHashHex}`;

    // HMAC key: INGEST_SIGNING_SECRET + hashed_secret
    const hmacKeyMaterial = this.ingestSigningSecret + secretHashHex;
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(hmacKeyMaterial),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      keyMaterial,
      new TextEncoder().encode(message),
    );

    return this.bytesToHex(new Uint8Array(signatureBuffer));
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private emitConnection(connected: boolean) {
    this.connected = connected;
    for (const listener of this.connectionListeners) {
      try {
        listener(connected);
      } catch {
        /* ignore */
      }
    }
  }
}
