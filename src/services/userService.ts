/**
 * User Service — Firebase Realtime Database (Production)
 * Handles user profiles, presence (online/offline), and subscriptions.
 */

import {
  ref,
  set,
  get,
  update,
  onValue,
  onDisconnect,
  serverTimestamp,
  runTransaction,
  DataSnapshot,
} from 'firebase/database';
import { database } from '../config/firebase';

export type VeeUser = {
  uid: string;
  vId: string;
  name: string;
  email: string;
  photoURL: string;
  bio: string;
  createdAt: number;
  lastSeen: number | object; // object when serverTimestamp()
  online: boolean;
  followers?: number;
  following?: number;
  roomsHosted?: number;
  oneSignalId?: string;     // OneSignal push subscription ID
  hasActiveStory?: boolean;
  /**
   * Cloudinary public_id of the current profile photo.
   * Stored so a future server-side Cloud Function can delete the old asset
   * when the user uploads a new photo. Never used for display — photoURL is
   * the canonical display field.
   */
  photoPublicId?: string;
  /**
   * Privacy settings saved by the user in the Privacy screen.
   * Stored at users/{uid}/privacy — read here so UI can enforce them without
   * a separate fetch when the profile is already subscribed.
   */
  privacy?: {
    showOnlineStatus?: boolean;
    showLastSeen?: boolean;
    allowMessageFromAll?: boolean;
    allowRoomInvites?: boolean;
    profileVisibility?: 'everyone' | 'followers' | 'none';
  };
};

// ─── User CRUD ───────────────────────────────────────────────────────────────

/** Save a new user to the database. Called once on signup. */
export async function createUser(user: VeeUser): Promise<void> {
  await set(ref(database, `users/${user.uid}`), {
    ...user,
    createdAt: user.createdAt ?? Date.now(),
    lastSeen: serverTimestamp(),
    online: true,
    followers: 0,
    following: 0,
    roomsHosted: 0,
  });
}

/** Fetch a single user by uid */
export async function getUser(uid: string): Promise<VeeUser | null> {
  const snap: DataSnapshot = await get(ref(database, `users/${uid}`));
  return snap.exists() ? (snap.val() as VeeUser) : null;
}

/** Update specific fields of a user's profile */
export async function updateUser(
  uid: string,
  data: Partial<Omit<VeeUser, 'uid' | 'vId' | 'createdAt'>>,
): Promise<void> {
  await update(ref(database, `users/${uid}`), data);
}

// ─── Presence (Online/Offline) ────────────────────────────────────────────────

/**
 * Set up real-time presence tracking.
 * Call this once after login. Firebase handles disconnect automatically.
 */
export function setupPresence(uid: string): void {
  // BUG 20 fix: both userRef and userPresenceRef pointed to the same path,
  // creating two identical ref objects unnecessarily. Consolidate into one.
  const userRef = ref(database, `users/${uid}`);

  // When user disconnects, Firebase automatically marks them offline.
  onDisconnect(userRef).update({
    online: false,
    lastSeen: serverTimestamp(),
  });

  // Mark as online now (fire-and-forget — non-critical if it fails)
  update(userRef, {
    online: true,
    lastSeen: serverTimestamp(),
  }).catch(() => {});
}

/** Manually mark user offline (call on logout) */
export async function setUserOffline(uid: string): Promise<void> {
  await update(ref(database, `users/${uid}`), {
    online: false,
    lastSeen: serverTimestamp(),
  });
}

// ─── Subscriptions ─────────────────────────────────────────────────────────

/** Listen to a user's profile in real-time. Returns unsubscribe function. */
export function subscribeUser(
  uid: string,
  callback: (user: VeeUser | null) => void,
): () => void {
  const userRef = ref(database, `users/${uid}`);
  return onValue(userRef, (snap) => {
    callback(snap.exists() ? (snap.val() as VeeUser) : null);
  });
}

/** Check if a Vee ID is already taken */
export async function isVIdAvailable(vId: string): Promise<boolean> {
  const snap = await get(ref(database, `vids/${vId}`));
  return !snap.exists();
}

/**
 * Reserve a Vee ID (store uid → vId mapping for uniqueness).
 * Uses a transaction so two signups racing for the same generated vId can't
 * both "win" — only the first writer succeeds. Callers must retry with a new
 * vId when this returns false.
 */
export async function reserveVId(uid: string, vId: string): Promise<boolean> {
  const result = await runTransaction(ref(database, `vids/${vId}`), (current) => {
    if (current !== null) {
      return undefined; // already taken — abort
    }
    return uid;
  });
  return result.committed;
}

/**
 * Generate a Vee ID and atomically reserve it in one step, retrying on
 * collision. This is the safe entry point — it replaces the old
 * check-then-write pattern (`isVIdAvailable` + `reserveVId`) which had a gap
 * where two concurrent signups could both "pass" the check for the same ID
 * before either wrote it. Throws if no free ID is found within `maxAttempts`.
 */
export async function generateAndReserveVId(
  uid: string,
  generateVId: () => string,
  maxAttempts = 5,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const vId = generateVId();
    const reserved = await reserveVId(uid, vId);
    if (reserved) return vId;
  }
  throw new Error('Could not reserve a unique Vee ID — please try again.');
}

/**
 * Write a permanently-generated Vee ID onto a user record. Intended only for
 * the one-time backfill of accounts created before/without a vId — regular
 * `updateUser` intentionally excludes `vId` from its type so it can never be
 * edited afterwards.
 */
export async function setUserVId(uid: string, vId: string): Promise<void> {
  await update(ref(database, `users/${uid}`), { vId });
}
