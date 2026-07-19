/**
 * Notify Service — client → API server → OneSignal
 *
 * Fire-and-forget push notification trigger. The API server holds the
 * OneSignal REST API key and forwards the request. Recipients are targeted
 * by their Firebase uid, which is set as the OneSignal "external user id"
 * via `OneSignal.login(uid)` on app start (see pushNotificationService.ts).
 *
 * RC8-A security fix: the request now includes a Firebase ID token in the
 * Authorization header so the API server can verify the caller is a
 * legitimate authenticated user.
 *
 * RC8-B2: API base URL is read from EXPO_PUBLIC_DOMAIN (set per EAS build
 * profile in eas.json) so dev / staging / production can point at different
 * servers without a code change. Falls back to the production Render URL.
 *
 * Never throws — a failed push should never block the underlying action.
 */

import { auth } from '../config/firebase';
import { getApiBase } from '../utils/platform';

const MAX_NOTIFY_RETRIES = 2;
const RETRY_DELAY_MS = 2500;

/**
 * Obtain the current user's Firebase ID token. Returns null if the user
 * is not authenticated or if the token fetch fails (non-blocking).
 */
async function getCallerToken(): Promise<string | null> {
  try {
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

/**
 * RC8-B2: Fetch with retry for cold-start resilience.
 * Render free tier can take 30-60 s to wake; the warm-up ping in _layout.tsx
 * helps but may not always beat the first notification. Retrying twice with
 * a 2.5 s delay covers most cold-start scenarios without blocking the caller.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retriesLeft = MAX_NOTIFY_RETRIES,
): Promise<void> {
  try {
    await fetch(url, options);
  } catch (err) {
    if (retriesLeft <= 0) throw err;
    await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchWithRetry(url, options, retriesLeft - 1);
  }
}

/**
 * Send a push notification to a single recipient.
 * @param targetUid Firebase uid of the recipient.
 * @param title     Notification title (e.g. sender's name).
 * @param message   Notification body.
 * @param data      Optional payload delivered as `additionalData` on the client
 *                  (e.g. `{ chatId }` so tapping opens the right chat).
 */
export function sendPushNotification(
  targetUid: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!targetUid || !title || !message) return;

  // Run async logic inside a fire-and-forget IIFE so the public API stays
  // synchronous — callers don't await push delivery.
  (async () => {
    try {
      const token = await getCallerToken();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // RC8-B2: fetchWithRetry handles Render cold-start (server sleeping on free tier)
      await fetchWithRetry(`${getApiBase()}/api/notifications/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ externalUserId: targetUid, title, message, data }),
      });
    } catch (err) {
      // Non-critical: a failed push must never surface to the user or crash the app.
      // Log in development so developers can diagnose delivery issues.
      if (__DEV__) {
        console.warn('[notifyService] sendPushNotification failed:', err);
      }
    }
  })();
}
