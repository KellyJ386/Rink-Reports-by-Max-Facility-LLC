"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * usePushSubscription
 *
 * Manages browser push notification subscription state.
 *
 * - Detects browser support for Service Worker + PushManager.
 * - subscribe(): requests notification permission, registers/retrieves
 *   the PWA service worker, creates a push subscription using the VAPID
 *   public key, and POSTs it to /api/push/subscribe.
 * - unsubscribe(): unsubscribes the current push subscription.
 *
 * The VAPID public key is read from NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 * Generate keys with: npx web-push generate-vapid-keys
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription() {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] =
    useState<PushSubscription | null>(null);

  // Check current subscription state on mount
  useEffect(() => {
    if (!isSupported) return;

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        if (!cancelled) {
          setSubscription(existing);
          setIsSubscribed(existing !== null);
        }
      })
      .catch(() => {
        // If SW is not registered yet, just stay unsubscribed
      });

    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      throw new Error("Push notifications are not supported in this browser");
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission denied");
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured");
    }

    // Register / retrieve the PWA service worker
    const registration = await navigator.serviceWorker.ready;

    // Create push subscription
    // urlBase64ToUint8Array returns Uint8Array; cast to BufferSource for the
    // PushSubscriptionOptionsInit type which expects a stricter ArrayBuffer view.
    const pushSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });

    // POST to server — fire and store
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: pushSubscription.toJSON() }),
    });

    if (!res.ok) {
      // Unsubscribe locally if server rejected
      await pushSubscription.unsubscribe();
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(
        (errorBody as { error?: string }).error ??
          "Failed to save push subscription",
      );
    }

    setSubscription(pushSubscription);
    setIsSubscribed(true);
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!subscription) return;
    await subscription.unsubscribe();
    setSubscription(null);
    setIsSubscribed(false);
  }, [subscription]);

  return {
    isSupported,
    isSubscribed,
    subscription,
    subscribe,
    unsubscribe,
  };
}
