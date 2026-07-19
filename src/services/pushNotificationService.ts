/**
 * Push Notification Service — OneSignal Client Integration
 *
 * BUG 13 fix: Detect Expo Go and skip native OneSignal initialization.
 * TurboModuleRegistry.getEnforcing('OneSignal') crashes in Expo Go because
 * the native module is not bundled there. We detect Expo Go via
 * expo-constants and short-circuit all OneSignal calls in that environment.
 * OneSignal is fully initialized only in EAS Development Builds and
 * production APK/IPA builds.
 *
 * isExpoGo() is now imported from src/utils/platform.ts (single source of
 * truth — previously duplicated here and in useZegoVoiceRoom.ts).
 */

import { update, ref } from 'firebase/database';
import { database } from '../config/firebase';
import { isExpoGo } from '../utils/platform';

// ─── OneSignal SDK — lazy native require ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let OneSignal: any = null;

async function getOneSignal() {
  // BUG 13: Never attempt to load the native module in Expo Go
  if (isExpoGo()) return null;

  if (OneSignal) return OneSignal;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-onesignal');
    OneSignal = mod.default ?? mod.OneSignal ?? mod;
    return OneSignal;
  } catch {
    // EAS Dev Build ছাড়া native module পাওয়া যাবে না — graceful fallback
    return null;
  }
}

/** App start-এ একবার call করুন (app/_layout.tsx-এ) */
export async function initializeOneSignal(appId: string): Promise<void> {
  // BUG 13: Skip entirely in Expo Go
  if (isExpoGo()) return;

  const os = await getOneSignal();
  if (!os) return;
  try {
    os.initialize(appId);
    // Permission request (Android 13+)
    os.Notifications.requestPermission(true);
  } catch {
    // silently ignore — Expo Go-তে কাজ করবে না, EAS Build-এ করবে
  }
}

/** User login/signup-এর পর call করুন — Firebase UID দিয়ে OneSignal-কে link করে */
export async function loginOneSignal(uid: string): Promise<void> {
  // BUG 13: Skip entirely in Expo Go
  if (isExpoGo()) return;

  const os = await getOneSignal();
  if (!os) return;
  try {
    // External ID set করলে Cloud Function থেকে এই user-কে target করা যাবে
    await os.login(uid);
    // Subscription ID Firebase-এ save করি
    const subId: string | undefined = os.User?.pushSubscription?.id ?? undefined;
    if (subId) {
      await saveOneSignalIdToFirebase(uid, subId);
    }
  } catch {
    // silently ignore
  }
}

/** Logout-এর সময় call করুন */
export async function logoutOneSignal(): Promise<void> {
  // BUG 13: Skip entirely in Expo Go
  if (isExpoGo()) return;

  const os = await getOneSignal();
  if (!os) return;
  try {
    await os.logout();
  } catch {
    // silently ignore
  }
}

/**
 * Register a handler for when the user taps a (background/killed-state) push
 * notification.
 *
 * Routing:
 *   chatId present                         → onChat(chatId)   (open DM thread)
 *   type is 'room-invite' | 'seat-approved'
 *       | 'seat-invite' and roomId present → onRoom(roomId)   (open voice room)
 *   otherwise                              → onFallback()      (open Inbox list)
 *
 * RC8-B2: Added onRoom callback so seat-approved, room-invite, and seat-invite
 * push notifications navigate directly to the voice room instead of Inbox.
 * Never throws — any SDK/parsing error safely falls back to Inbox.
 * Call once on app start (app/_layout.tsx).
 */
export async function registerNotificationOpenedHandler(
  onChat: (chatId: string) => void,
  onRoom: (roomId: string) => void,
  onFallback: () => void,
): Promise<() => void> {
  // BUG 13: Skip entirely in Expo Go
  if (isExpoGo()) return () => {};

  const os = await getOneSignal();
  if (!os?.Notifications?.addEventListener) return () => {};

  const ROOM_NOTIFICATION_TYPES = new Set([
    'room-invite',
    'seat-approved',
    'seat-invite',
    'seat-rejected', // navigate to room so user sees the seat state
  ]);

  const handler = (event: unknown) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (event as any)?.notification?.additionalData as
        | Record<string, unknown>
        | undefined;
      const chatId = data?.chatId;
      const roomId = data?.roomId;
      const type   = data?.type;

      if (typeof chatId === 'string' && chatId.length > 0) {
        onChat(chatId);
      } else if (
        typeof type === 'string' &&
        ROOM_NOTIFICATION_TYPES.has(type) &&
        typeof roomId === 'string' &&
        roomId.length > 0
      ) {
        onRoom(roomId);
      } else {
        onFallback();
      }
    } catch {
      // Never crash on a malformed notification payload — go to Inbox.
      onFallback();
    }
  };

  try {
    os.Notifications.addEventListener('click', handler);
    return () => {
      try {
        os.Notifications.removeEventListener?.('click', handler);
      } catch {
        // non-critical
      }
    };
  } catch {
    return () => {};
  }
}

/** OneSignal subscription ID Firebase users/{uid}/oneSignalId-এ save করে */
async function saveOneSignalIdToFirebase(uid: string, oneSignalId: string): Promise<void> {
  try {
    await update(ref(database, `users/${uid}`), { oneSignalId });
  } catch {
    // non-critical
  }
}
