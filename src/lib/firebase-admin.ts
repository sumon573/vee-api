/**
 * Shared Firebase Admin singleton.
 *
 * Supports both FIREBASE_SERVICE_ACCOUNT and FIREBASE_SERVICE_ACCOUNT_KEY
 * env var names (Render dashboard has both variants across different deploys).
 *
 * Lazily initialised on first use — if the env var is absent the module
 * gracefully returns null so the server stays up (with reduced functionality).
 *
 * Safe to call from multiple modules: uses a single promise to prevent
 * duplicate initializeApp() calls which Firebase throws on.
 */

import { logger } from "./logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any = null;
let _initPromise: Promise<void> | null = null;

function parseServiceAccount(): Record<string, unknown> | null {
  const raw =
    process.env["FIREBASE_SERVICE_ACCOUNT"] ??
    process.env["FIREBASE_SERVICE_ACCOUNT_KEY"];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn(
      "FIREBASE_SERVICE_ACCOUNT env var is set but contains invalid JSON — Firebase Admin disabled",
    );
    return null;
  }
}

async function _init(): Promise<void> {
  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    logger.warn(
      "Firebase Admin SDK not initialised: set FIREBASE_SERVICE_ACCOUNT to a valid JSON service account key",
    );
    return;
  }

  const databaseURL =
    process.env["FIREBASE_DATABASE_URL"] ??
    "https://vee-chat-36720-default-rtdb.asia-southeast1.firebasedatabase.app";

  // firebase-admin v14 uses the modular subpath API — the legacy namespace
  // import (import("firebase-admin")) no longer exposes .credential /
  // .initializeApp / .database / .auth at the top level.
  // Use the correct subpath entry-points instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appPkg  = (await import("firebase-admin/app")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbPkg   = (await import("firebase-admin/database")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authPkg = (await import("firebase-admin/auth")) as any;

  const initializeApp = appPkg.initializeApp;
  const getApps       = appPkg.getApps;
  const cert          = appPkg.cert;
  const getDatabase   = dbPkg.getDatabase;
  const getAuth       = authPkg.getAuth;

  const existing = getApps();
  const app = existing.length > 0
    ? existing[0]
    : initializeApp({
        credential: cert(serviceAccount),
        databaseURL,
      });

  _db   = getDatabase(app);
  _auth = getAuth(app);
  logger.info({ databaseURL }, "Firebase Admin: initialised");
}

function ensureInit(): Promise<void> {
  if (!_initPromise) _initPromise = _init().catch((err: unknown) => {
    logger.error({ err }, "Firebase Admin initialisation failed");
  });
  return _initPromise;
}

/** Firebase Admin Realtime Database instance, or null if unconfigured. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAdminDb(): Promise<any | null> {
  await ensureInit();
  return _db;
}

/** Firebase Admin Auth instance, or null if unconfigured. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAdminAuth(): Promise<any | null> {
  await ensureInit();
  return _auth;
}
