// Web Push subscription helpers for the artist PWA. Wraps the browser
// PushManager and the push-subscribe edge function so the rest of the app
// only sees `enablePushNotifications()` and `refreshPushSubscription()`.
//
// Two flows:
//   1. enablePushNotifications() — first-time opt-in. Asks for notification
//      permission (must be called from a user gesture), then subscribes
//      against our VAPID public key and POSTs the subscription to Supabase.
//   2. refreshPushSubscription() — silent maintenance. If a subscription
//      already exists in pushManager, re-POST it so last_seen_at stays
//      fresh and we recover from any server-side row deletion.
//
// The browser caches the subscription in the registration; calling
// pushManager.subscribe() with the same applicationServerKey returns the
// same subscription, so re-subscribing is free and idempotent.

import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

async function postSubscription(subscription: PushSubscription): Promise<boolean> {
  // We need an access token to authenticate against the edge function.
  // If the user isn't signed in, just bail — they shouldn't be seeing the
  // enable button in the first place, but defensively skip rather than 401.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const { error } = await supabase.functions.invoke('push-subscribe', {
    body: subscription.toJSON(),
  });
  if (error) {
    console.error('push-subscribe failed', error);
    return false;
  }
  return true;
}

/**
 * First-time opt-in. Must be called from a user gesture (button click).
 * Returns the resulting NotificationPermission so callers can update UI.
 */
export async function enablePushNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VITE_VAPID_PUBLIC_KEY missing — push disabled');
    return 'unsupported';
  }

  // Ask for permission first. requestPermission returns 'granted'/'denied'/'default'.
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    permission = Notification.permission;
  }
  if (permission !== 'granted') return permission;

  try {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      // applicationServerKey expects a BufferSource; passing the raw
      // Uint8Array trips strict TS because ArrayBufferLike can include
      // SharedArrayBuffer. Hand it the underlying ArrayBuffer to keep
      // the type narrow.
      const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer as ArrayBuffer,
      });
    }
    await postSubscription(subscription);
  } catch (err) {
    // Most common cause: user is browsing inkbloop.com in regular Safari
    // (not an installed PWA on iOS). pushManager.subscribe rejects in that
    // case. Permission is still 'granted' so we report success — we just
    // can't actually receive pushes here.
    console.error('pushManager.subscribe failed', err);
  }

  return permission;
}

/**
 * Idempotent maintenance call. Only POSTs if a subscription already exists.
 * Safe to fire-and-forget on every authenticated boot.
 */
export async function refreshPushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return;
    await postSubscription(subscription);
  } catch {
    // Maintenance — silent on failure.
  }
}
