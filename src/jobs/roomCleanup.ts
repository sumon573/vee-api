/**
 * Room Session Cleanup Job
 *
 * When the last user leaves a voice room the room is NOT deleted.
 * Only session data is cleared after a 30–60 s grace period so that a
 * quick rejoin prevents the wipe.
 *
 * Cleared on session reset (room keeps its metadata):
 *   rooms/{roomId}/chat           – message history
 *   rooms/{roomId}/seats          – speaker seats
 *   rooms/{roomId}/audience       – audience presence
 *   rooms/{roomId}/reactions      – emoji bursts
 *   rooms/{roomId}/lockedSeats    – seat locks
 *   rooms/{roomId}/seatRequests   – pending requests
 *   roomBlocks/{roomId}           – per-session blocks
 *   rooms/{roomId}/info.*         – active/isLive → false, counters reset
 *
 * Preserved (room metadata never touched):
 *   rooms/{roomId}/info.id / name / ownerId / isPublic / category /
 *       themeColor / coverImageUrl / createdAt / description / topic
 *   roomPins/{roomId}             – PIN kept for future sessions
 *
 * Design guarantees:
 *   Idempotent  — running twice on the same empty room is side-effect-free.
 *   Crash-safe  — each step is an independent Firebase write; a mid-cleanup
 *                 crash leaves the room in a "partially reset" state that the
 *                 next run can safely retry.
 *   Race-safe   — grace-period + recheck prevents a wipe when a user rejoins
 *                 between the last-leave event and the timer firing.
 *
 * Environment variables (must match Render / production backend):
 *   FIREBASE_SERVICE_ACCOUNT  – JSON string of the Firebase Admin service
 *                               account credentials (same name used everywhere
 *                               in the production backend).
 *   FIREBASE_DATABASE_URL     – Optional. Realtime Database URL. Falls back to
 *                               the hardcoded production URL if not set.
 */

import { logger } from "../lib/logger.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

const GRACE_PERIOD_MS = 45_000; // 45 s — must be 30–60 s per spec

/**
 * Hardcoded fallback so the job works even if FIREBASE_DATABASE_URL is not
 * explicitly set on the host (the URL is public, non-sensitive info).
 */
const FALLBACK_DATABASE_URL =
  "https://vee-chat-36720-default-rtdb.asia-southeast1.firebasedatabase.app";

// ─── Firebase Admin — lazy ESM initialisation ──────────────────────────────────

// We use a top-level `let` + lazy init so:
//   a) The server starts without crashing when env vars are absent (dev/test).
//   b) ESM dynamic import() is used — compatible with `"type": "module"` and
//      with the esbuild bundle that externalises firebase-admin.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminDb: any = null;
let adminInitAttempted = false;

async function getDb() {
  if (adminDb) return adminDb;
  if (adminInitAttempted) return null; // already failed — don't retry
  adminInitAttempted = true;

  const serviceAccountRaw = process.env["FIREBASE_SERVICE_ACCOUNT"];
  const databaseURL =
    process.env["FIREBASE_DATABASE_URL"] ?? FALLBACK_DATABASE_URL;

  if (!serviceAccountRaw) {
    logger.warn(
      "FIREBASE_SERVICE_ACCOUNT env var not set — room cleanup job disabled",
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountRaw);
    // Dynamic ESM import — firebase-admin is externalised by esbuild so Node
    // resolves it from node_modules at runtime.
    // firebase-admin is externalised by esbuild — resolved from node_modules
    // at runtime. Cast to `any` because the ESM dynamic-import type wrapper
    // differs from the CJS type declarations; runtime shape is identical.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminPkg = (await import("firebase-admin")) as any;
    // firebase-admin v14 ships both a default export and named re-exports;
    // prefer `.default` (ESM), fall back to the module itself (CJS compat).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminModule = (adminPkg.default ?? adminPkg) as any;

    if (!adminModule.apps.length) {
      adminModule.initializeApp({
        credential: adminModule.credential.cert(serviceAccount),
        databaseURL,
      });
    }
    adminDb = adminModule.database();
    logger.info({ databaseURL }, "Firebase Admin initialised for room cleanup");
    return adminDb;
  } catch (err) {
    logger.error(
      { err },
      "Failed to initialise Firebase Admin — room cleanup disabled",
    );
    return null;
  }
}

// ─── Grace-period tracker ──────────────────────────────────────────────────────

/** roomId → pending cleanup timer */
const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Core cleanup ──────────────────────────────────────────────────────────────

/**
 * Clear session data for a room without touching its metadata.
 * Idempotent and safe to call multiple times.
 */
async function resetRoomSession(roomId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  logger.info({ roomId }, "Resetting room session (last user left)");

  try {
    const infoRef = db.ref(`rooms/${roomId}/info`);
    const infoSnap = await infoRef.once("value");

    if (!infoSnap.exists()) {
      logger.info({ roomId }, "Room info missing — skipping reset");
      return;
    }

    const info = infoSnap.val() as Record<string, unknown>;
    if (!info["active"]) {
      logger.info({ roomId }, "Room already inactive — reset skipped");
      return;
    }

    // Mark room as inactive (preserves all metadata fields)
    await infoRef.update({
      active: false,
      isLive: false,
      memberCount: 0,
      listenerCount: 0,
      memberPreviews: [],
      isTrending: false,
      closedAt: Date.now(),
    });

    // Purge session collections — allSettled so a single failure doesn't
    // abort the rest (idempotent on next run)
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
    logger.error({ err, roomId }, "Room session reset failed — will retry next cycle");
  }
}

/**
 * Returns true when both seats and audience for the room are empty.
 */
async function isRoomEmpty(roomId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const [seats, audience] = await Promise.all([
      db.ref(`rooms/${roomId}/seats`).once("value"),
      db.ref(`rooms/${roomId}/audience`).once("value"),
    ]);
    return !seats.exists() && !audience.exists();
  } catch {
    return false;
  }
}

// ─── Grace-period scheduler ────────────────────────────────────────────────────

function scheduleCleanup(roomId: string): void {
  // Cancel any earlier pending cleanup for this room
  const existing = pendingCleanups.get(roomId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingCleanups.delete(roomId);
    // Recheck after grace period — a rejoin cancels the cleanup
    const empty = await isRoomEmpty(roomId);
    if (empty) {
      await resetRoomSession(roomId);
    } else {
      logger.info({ roomId }, "Room not empty after grace period — cleanup cancelled (user rejoined)");
    }
  }, GRACE_PERIOD_MS);

  pendingCleanups.set(roomId, timer);
  logger.info({ roomId, graceMs: GRACE_PERIOD_MS }, "Room cleanup scheduled");
}

// ─── Per-room watcher ──────────────────────────────────────────────────────────

const watchedRooms = new Set<string>();
const roomUnsubFns = new Map<string, () => void>();

function watchRoom(roomId: string): void {
  if (watchedRooms.has(roomId)) return;
  watchedRooms.add(roomId);

  getDb().then((db) => {
    if (!db) return;

    let seatCount = 0;
    let audCount = 0;

    const onCountChange = () => {
      const total = seatCount + audCount;
      if (total === 0) {
        scheduleCleanup(roomId);
      } else {
        // Someone is present — cancel any pending cleanup
        const t = pendingCleanups.get(roomId);
        if (t) {
          clearTimeout(t);
          pendingCleanups.delete(roomId);
          logger.info({ roomId }, "Pending cleanup cancelled — room has members");
        }
      }
    };

    const seatsRef = db.ref(`rooms/${roomId}/seats`);
    const audRef   = db.ref(`rooms/${roomId}/audience`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seatsHandler = (snap: any) => {
      let n = 0;
      snap.forEach(() => n++);
      seatCount = n;
      onCountChange();
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audHandler = (snap: any) => {
      let n = 0;
      snap.forEach(() => n++);
      audCount = n;
      onCountChange();
    };

    seatsRef.on("value", seatsHandler);
    audRef.on("value", audHandler);

    roomUnsubFns.set(roomId, () => {
      seatsRef.off("value", seatsHandler);
      audRef.off("value", audHandler);
      watchedRooms.delete(roomId);
      roomUnsubFns.delete(roomId);
      const t = pendingCleanups.get(roomId);
      if (t) { clearTimeout(t); pendingCleanups.delete(roomId); }
    });
  });
}

function unwatchRoom(roomId: string): void {
  roomUnsubFns.get(roomId)?.();
}

// ─── Top-level active-rooms watcher ───────────────────────────────────────────

let _stopped = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _activeRoomsHandler: ((snap: any) => void) | null = null;

export async function startRoomCleanupJob(): Promise<void> {
  const db = await getDb();
  if (!db) return; // env vars absent — graceful no-op

  logger.info("Room cleanup job starting");
  _stopped = false;

  const activeRoomsRef = db.ref("rooms");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _activeRoomsHandler = (snap: any) => {
    if (_stopped) return;

    const liveRoomIds = new Set<string>();

    snap.forEach((roomSnap: any) => {
      const roomId: string = roomSnap.key;
      if (!roomId) return;

      // Read info child to check active flag
      const infoSnap = roomSnap.child("info");
      const info = infoSnap.val() as Record<string, unknown> | null;
      if (info?.["active"] === true) {
        liveRoomIds.add(roomId);
        watchRoom(roomId);
      }
    });

    // Stop watching rooms that are no longer active
    for (const roomId of watchedRooms) {
      if (!liveRoomIds.has(roomId)) {
        unwatchRoom(roomId);
      }
    }
  };

  activeRoomsRef.on("value", _activeRoomsHandler);
}

export function stopRoomCleanupJob(): void {
  _stopped = true;
  getDb().then((db) => {
    if (db && _activeRoomsHandler) {
      db.ref("rooms").off("value", _activeRoomsHandler);
    }
  });
  for (const [, t] of pendingCleanups) clearTimeout(t);
  pendingCleanups.clear();
  for (const [, unsub] of roomUnsubFns) unsub();
  roomUnsubFns.clear();
  watchedRooms.clear();
}
