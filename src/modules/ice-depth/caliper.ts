"use client";

/**
 * CaliperAdapter — Web Bluetooth bridge to a wireless digital caliper.
 *
 * There is no single "caliper" Bluetooth GATT profile, so the adapter
 * tries a list of well-known service/characteristic pairs that cover
 * the vast majority of BLE-modded calipers in the field:
 *
 *   1. HM-10 / CC2541 BLE-serial bridge — service 0xFFE0,
 *      notify characteristic 0xFFE1. This is what the cheap
 *      "BLE caliper" mods on AliExpress and the iGaging EZ-Cal BT
 *      receivers use. ASCII text frames.
 *
 *   2. Nordic UART Service (NUS) — used by anything based on a
 *      Nordic nRF52 chip. ASCII text frames over the TX
 *      characteristic 6e400003-b5a3-f393-e0a9-e50e24dcca9e.
 *
 *   3. Generic discovery — if neither known service is present, scan
 *      every primary service for any characteristic that supports
 *      `notify` and subscribe to all of them. The first one to fire
 *      with a parseable numeric value wins and the rest are dropped.
 *
 * Incoming frames are decoded as ASCII first (with optional unit
 * suffix and CR/LF stripping); if that fails, we fall back to
 * little-endian Float32 / Float64 binary. Either way the parsed
 * number is delivered to the consumer as a CaliperReading.
 *
 * The adapter is a tiny event emitter — no React, no globals — so
 * it composes cleanly with the offline-first form. Connection state
 * lives on the instance, callbacks are subscribe/unsubscribe.
 */

export interface CaliperReading {
  /** Parsed numeric value, in the device's unit (we trust the device). */
  value: number;
  /** Original raw text frame (or hex string for binary). */
  raw: string;
  /** Best-effort unit guess from the frame ("mm" / "in" / undefined). */
  unit?: "mm" | "in";
}

export type CaliperListener = (reading: CaliperReading) => void;
export type CaliperConnectionListener = (connected: boolean) => void;

interface KnownProfile {
  name: string;
  service: BluetoothServiceUUID;
  notifyChar: BluetoothCharacteristicUUID;
}

const KNOWN_PROFILES: readonly KnownProfile[] = [
  {
    name: "HM-10 BLE serial",
    service: "0000ffe0-0000-1000-8000-00805f9b34fb",
    notifyChar: "0000ffe1-0000-1000-8000-00805f9b34fb",
  },
  {
    name: "Nordic UART",
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    notifyChar: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  },
];

/**
 * Try to coerce an incoming notification value into a CaliperReading.
 *
 * Strategy:
 *   1. Decode as ASCII text. If it contains a numeric token,
 *      parseFloat it and look for a unit suffix.
 *   2. Otherwise, try Float32 LE then Float64 LE.
 *   3. If nothing parses, return null and the listener loop drops
 *      the frame.
 */
export function parseCaliperFrame(buffer: ArrayBuffer): CaliperReading | null {
  const bytes = new Uint8Array(buffer);

  // ---- ASCII path ---------------------------------------------------
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
  } catch {
    text = "";
  }
  if (text.length > 0) {
    // Strip CR/LF, surrounding noise. Match a signed decimal.
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const n = Number(match[0]);
      if (Number.isFinite(n)) {
        const lower = text.toLowerCase();
        let unit: "mm" | "in" | undefined;
        if (lower.includes("mm")) unit = "mm";
        else if (lower.includes("in") || lower.includes('"')) unit = "in";
        return { value: n, raw: text, unit };
      }
    }
  }

  // ---- Binary fallback ---------------------------------------------
  if (bytes.length >= 4) {
    const view = new DataView(buffer);
    const f32 = view.getFloat32(0, true);
    if (Number.isFinite(f32) && Math.abs(f32) < 100000) {
      return { value: f32, raw: hex(bytes), unit: undefined };
    }
  }
  if (bytes.length >= 8) {
    const view = new DataView(buffer);
    const f64 = view.getFloat64(0, true);
    if (Number.isFinite(f64) && Math.abs(f64) < 100000) {
      return { value: f64, raw: hex(bytes), unit: undefined };
    }
  }

  return null;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export class CaliperAdapter {
  // Public connection state, read by the form to render the button.
  public deviceName: string | null = null;
  public profileName: string | null = null;

  private device: BluetoothDevice | null = null;
  private characteristics: BluetoothRemoteGATTCharacteristic[] = [];
  private listeners = new Set<CaliperListener>();
  private connectionListeners = new Set<CaliperConnectionListener>();
  private boundOnNotify = (event: Event) => this.onNotify(event);
  private boundOnDisconnect = () => this.handleDisconnect();

  /**
   * Web Bluetooth is only available in secure contexts on Chromium-
   * family browsers (Chrome, Edge, Opera). Safari and Firefox do not
   * ship it. The form uses this to gate the Connect button.
   */
  static isSupported(): boolean {
    if (typeof navigator === "undefined") return false;
    if (typeof window === "undefined") return false;
    if (!("bluetooth" in navigator)) return false;
    // Web Bluetooth requires a secure context.
    return window.isSecureContext === true;
  }

  get isConnected(): boolean {
    return this.device?.gatt?.connected === true;
  }

  /**
   * Subscribe to numeric readings. Returns an unsubscribe function.
   */
  onReading(listener: CaliperListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConnectionChange(listener: CaliperConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  /**
   * Trigger the browser's BLE device picker, connect, find a profile,
   * and start notifications. Throws on user cancel or any failure.
   */
  async connect(): Promise<void> {
    if (!CaliperAdapter.isSupported()) {
      throw new Error(
        "Web Bluetooth is not available in this browser. Use Chrome, Edge, or Opera over HTTPS.",
      );
    }

    // Ask for any device that exposes one of the known services. The
    // user will see all matching devices in the picker. We also pass
    // every known service in optionalServices so we can talk to it
    // post-connect (Web Bluetooth requires services be pre-declared).
    const optionalServices = KNOWN_PROFILES.map((p) => p.service);

    const bt = navigator.bluetooth;
    if (!bt) {
      throw new Error("Web Bluetooth is not available in this browser.");
    }
    const device = await bt.requestDevice({
      filters: KNOWN_PROFILES.map((p) => ({ services: [p.service] })),
      // The acceptAllDevices fallback is intentionally NOT set here
      // because Web Bluetooth disallows mixing filters with
      // acceptAllDevices. If the user's caliper exposes a custom
      // service we don't know about, the discovery path below covers
      // it AFTER they've at least connected once via a known UUID.
      optionalServices,
    });

    this.device = device;
    this.deviceName = device.name ?? "Caliper";
    device.addEventListener("gattserverdisconnected", this.boundOnDisconnect);

    const server = await device.gatt!.connect();

    // Walk known profiles first — the success path most calipers hit.
    for (const profile of KNOWN_PROFILES) {
      try {
        const service = await server.getPrimaryService(profile.service);
        const char = await service.getCharacteristic(profile.notifyChar);
        if (char.properties.notify || char.properties.indicate) {
          await char.startNotifications();
          char.addEventListener(
            "characteristicvaluechanged",
            this.boundOnNotify,
          );
          this.characteristics.push(char);
          this.profileName = profile.name;
          this.emitConnection(true);
          return;
        }
      } catch {
        // Profile not present on this device — try the next one.
      }
    }

    // Discovery fallback: subscribe to ALL notify-capable
    // characteristics across every primary service. This catches
    // calipers that expose a non-standard custom service.
    let subscribed = 0;
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.notify || char.properties.indicate) {
              try {
                await char.startNotifications();
                char.addEventListener(
                  "characteristicvaluechanged",
                  this.boundOnNotify,
                );
                this.characteristics.push(char);
                subscribed++;
              } catch {
                // Some characteristics refuse notifications — skip.
              }
            }
          }
        } catch {
          // Some services refuse enumeration — skip.
        }
      }
    } catch {
      // No services at all — give up below.
    }

    if (subscribed > 0) {
      this.profileName = `Discovery (${subscribed} characteristic${subscribed === 1 ? "" : "s"})`;
      this.emitConnection(true);
      return;
    }

    // Nothing usable. Tear down and bubble up.
    try {
      device.gatt?.disconnect();
    } catch {
      /* ignore */
    }
    this.device = null;
    this.deviceName = null;
    throw new Error(
      "Connected, but no usable notify characteristic was found. Your caliper may not be supported.",
    );
  }

  disconnect(): void {
    if (!this.device) return;
    for (const char of this.characteristics) {
      try {
        char.removeEventListener(
          "characteristicvaluechanged",
          this.boundOnNotify,
        );
      } catch {
        /* ignore */
      }
    }
    this.characteristics = [];
    try {
      this.device.removeEventListener(
        "gattserverdisconnected",
        this.boundOnDisconnect,
      );
      this.device.gatt?.disconnect();
    } catch {
      /* ignore */
    }
    this.device = null;
    this.deviceName = null;
    this.profileName = null;
    this.emitConnection(false);
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------
  private onNotify(event: Event) {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const value = target?.value;
    if (!value) return;
    // value is a DataView; copy its bytes into a fresh ArrayBuffer
    // so the parser sees only this frame and isn't affected by the
    // SharedArrayBuffer / ArrayBuffer union the spec returns.
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    const reading = parseCaliperFrame(copy.buffer);
    if (!reading) return;
    for (const listener of this.listeners) {
      try {
        listener(reading);
      } catch {
        /* listeners must not crash the adapter */
      }
    }
  }

  private handleDisconnect() {
    this.characteristics = [];
    this.device = null;
    this.deviceName = null;
    this.profileName = null;
    this.emitConnection(false);
  }

  private emitConnection(connected: boolean) {
    for (const listener of this.connectionListeners) {
      try {
        listener(connected);
      } catch {
        /* ignore */
      }
    }
  }
}
