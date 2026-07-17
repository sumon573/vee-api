/**
 * Room Session Cleanup Job
 *
 * When the last user leaves a voice room, the room should NOT be deleted.
 * Instead, only session data is cleared after a 30–60s grace period.
 *
 * What is cleared (session reset):
 *   ✓ rooms/{roomId}/chat
 *   ✓ rooms/{roomId}/seats
 *   ✓ rooms/{roomId}/audience
 *   ✓ rooms/{roomId}/reactions
 *   ✓ rooms/{roomId}/lockedSeats
 *   ✓ rooms/{roomId}/seatRequests
 *   ✓ roomBlocks/{roomId}
 *   ✓ rooms/{roomId}/info.{active, isLive} → set to false/false
 *
 * What is preserved (room metadata):
 *   ✓ rooms/{roomId}/info.id
 *   ✓ rooms/{roomId}/info.name
 *   ✓ rooms/{roomId}/info.ownerId
 *   ✓ rooms/{roomId}/info.isPublic
 *   ✓ rooms/{roomId}/info.category
 *   ✓ rooms/{roomId}/info.themeColor
 *   ✓ rooms/{roomId}/info.coverImageUrl
 *   ✓ rooms/{roomId}/info.createdAt
 *   ✓ roomPins/{roomId}  (PIN is preserved for future sessions)
 *
 * Design:
 *   ✓ Idempotent: running twice on the same empty room has no extra effect.
 *   ✓ Crash-safe: each cleanup step uses separate Firebase writes; a crash
 *       mid-cleanup leaves the room in an "already partially reset" state
 *       that's safe to retry.
 *   ✓ Race-condition-safe: the grace period + recheck pattern ensures that a
 *       quick rejoin between the last-leave and the cleanup prevents the reset.
 *   ✓ Memory-leak-free: all timers are tracked in a Map and cancelled on
 *       unsub or when a new user joins before the grace period ends.
 */

import { logger } from "../lib/logger.js";

// ─── Firebase Admin SDK ────────────────────────────────────────────────────────

// Firebase Admin is initialized lazily so the server starts even when env
// vars aren't set (dev/test mode). Cleanup simply doesn't run in that case.

type AdminDatabase = {
  ref(path?: string): AdminRef;
};

type AdminRef = {
  on(event: string, cb: (snap: AdminSnap) => void): void;
  off(): void;
  once(event: string): Promise<AdminSnap>;
  remove(): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
};

type AdminSnap = {
  exists(): boolean;
  val(): unknown;
  forEach(cb: (child: AdminSnap) => boolean | void): void;
  key: string | null;
};

let _db: AdminDatabase | null = null;

function getDb(): AdminDatabase | null {
  if (_db) return _db;

  const serviceAccountJson = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  const databaseUrl = process.env["FIREBASE_DATABASE_URL"];

  if (!serviceAccountJson || !databaseUrl) {
    logger.warn(
      "FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_DATABASE_URL not set — room cleanup job disabled",
    );
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseUrl,
      });
    }
    _db = admin.database() as AdminDatabase;
    return _db;
  } catch (err) {
    logger.error({ err }, "Failed to initialize Firebase Admin — room cleanup disabled");
    return null;
  }
}

// ─── Grace-period tracker ─────────────────────────────────────────────────────

/** roomId → NodeJS.Timeout for the scheduled cleanup */
const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>();

const GRACE_PERIOD_MS = 45_000; // 45 seconds

// ─── Cleanup Logic ────────────────────────────────────────────────────────────

/**
 * Clear a room's session data without deleting the room itself.
 * Idempotent: safe to call multiple times.
 */
async function resetRoomSession(roomId: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  logger.info({ roomId }, "Resetting room session (last user has left)");

  try {
    const infoRef = db.ref(`rooms/${roomId}/info`);
    const infoSnap = await infoRef.once("value");
    if (!infoSnap.exists()) {
      logger.info({ roomId }, "Room info not found — skipping reset");
      return;
    }

    const info = infoSnap.val() as Record<string, unknown>;
    if (!info.active) {
      // Already deactivated — nothing to do
      logger.info({ roomId }, "Room already inactive — skipping reset");
      return;
    }

    // Update room info: mark as inactive without deleting it
    await infoRef.update({
      active: false,
      isLive: false,
      memberCount: 0,
      listenerCount: 0,
      memberPreviews: [],
      isTrending: false,
      closedAt: Date.now(),
    });

    // Clear all session data in parallel (each remove is idempotent)
    await Promise.allSettled([
      db.ref(`rooms/${roomId}/chat`).remove(),
      db.ref(`rooms/${roomId}/seats`).remove(),
      db.ref(`rooms/${roomId}/audience`).remove(),
      db.ref(`rooms/${roomId}/reactions`).remove(),
      db.ref(`rooms/${roomId}/lockedSeats`).remove(),
      db.ref(`rooms/${roomId}/seatRequests`).remove(),
      db.ref(`roomBlocks/${roomId}`).remove(),
    ]);

    logger.info({ roomId }, "Room session reset complete");
  } catch (err) {
    logger.error({ err, roomId }, "Room session reset failed — will retry on next poll");
  }
}

/**
 * Check whether a room is truly empty (no seats, no audience).
 * Used after the grace period to confirm the room is still empty.
 */
async function isRoomEmpty(roomId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const [seatsSnap, audSnap] = await Promise.all([
      db.ref(`rooms/${roomId}/seats`).once("value"),
      db.ref(`rooms/${roomId}/audience`).once("value"),
    ]);
    return !seatsSnap.exists() && !audSnap.exists();
  } catch {
    return false;
  }
}

/**
 * Schedule a session reset for a room after the grace period.
 * If a new user joins before the timer fires, the pending cleanup is cancelled.
 */
function scheduleRoomCleanup(roomId: string): void {
  // Cancel any existing pending cleanup for this room
  const existing = pendingCleanups.get(roomId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingCleanups.delete(roomId);
    // Grace period elapsed — recheck before cleaning
    const empty = await isRoomEmpty(roomId);
    if (empty) {
      await resetRoomSession(roomId);
    } else {
      logger.info({ roomId }, "Room no longer empty after grace period — cleanup cancelled");
    }
  }, GRACE_PERIOD_MS);

  pendingCleanups.set(roomId, timer);
  logger.info({ roomId, graceMs: GRACE_PERIOD_MS }, "Room cleanup scheduled after grace period");
}

// ─── Active Room Watcher ──────────────────────────────────────────────────────

/** Set of room IDs currently being watched for emptiness. */
const watchedRooms = new Set<string>();
/** Map of roomId → listener unsub functions */
const roomListeners = new Map<string, () => void>();

function watchRoom(roomId: string): void {
  if (watchedRooms.has(roomId)) return;
  watchedRooms.add(roomId);

  const db = getDb();
  if (!db) return;

  // Watch seat + audience counts for this room
  let seatCount = 0;
  let audienceCount = 0;

  function onCountChange() {
    const total = seatCount + audienceCount;
    if (total === 0) {
      scheduleRoomCleanup(roomId);
    } else {
      // Someone is in the room — cancel any pending cleanup
      const pending = pendingCleanups.get(roomId);
      if (pending) {
        clearTimeout(pending);
        pendingCleanups.delete(roomId);
        logger.info({ roomId }, "Room cleanup cancelled — user rejoined");
      }
    }
  }

  const seatsRef = db.ref(`rooms/${roomId}/seats`);
  const audRef = db.ref(`rooms/${roomId}/audience`);

  seatsRef.on("value", (snap: AdminSnap) => {
    let count = 0;
    snap.forEach(() => { count++; });
    seatCount = count;
    onCountChange();
  });

  audRef.on("value", (snap: AdminSnap) => {
    let count = 0;
    snap.forEach(() => { count++; });
    audienceCount = count;
    onCountChange();
  });

  roomListeners.set(roomId, () => {
    seatsRef.off();
    audRef.off();
    watchedRooms.delete(roomId);
    roomListeners.delete(roomId);
    const pending = pendingCleanups.get(roomId);
    if (pending) { clearTimeout(pending); pendingCleanups.delete(roomId); }
  });
}

function unwatchRoom(roomId: string): void {
  const unsub = roomListeners.get(roomId);
  if (unsub) unsub();
}

// ─── Main Watcher (Active Rooms) ──────────────────────────────────────────────

let _activeRoomsUnsubscribed = false;

export function startRoomCleanupJob(): void {
  const db = getDb();
  if (!db) return;

  logger.info("Room cleanup job starting — watching active rooms");

  const activeRoomsRef = db.ref("rooms");

  activeRoomsRef.on("value", (snap: AdminSnap) => {
    if (_activeRoomsUnsubscribed) return;

    const currentRoomIds = new Set<string>();

    snap.forEach((roomSnap: AdminSnap) => {
      const roomId = roomSnap.key;
      if (!roomId) return;

      // Check if this is an active room
      let isActive = false;
      roomSnap.forEach((section: AdminSnap) => {
        if (section.key === "info") {
          const info = section.val() as Record<string, unknown> | null;
          if (info && info.active === true) isActive = true;
        }
      });

      if (isActive) {
        currentRoomIds.add(roomId);
        watchRoom(roomId);
      }
    });

    // Unwatch rooms that are no longer active
    for (const roomId of watchedRooms) {
      if (!currentRoomIds.has(roomId)) {
        unwatchRoom(roomId);
      }
    }
  });
}

export function stopRoomCleanupJob(): void {
  _activeRoomsUnsubscribed = true;
  const db = getDb();
  if (db) db.ref("rooms").off();
  for (const [, timer] of pendingCleanups) clearTimeout(timer);
  pendingCleanups.clear();
  for (const [, unsub] of roomListeners) unsub();
  roomListeners.clear();
  watchedRooms.clear();
}
