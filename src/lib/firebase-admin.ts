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

  // Dynamic ESM import — firebase-admin is externalised (not bundled by esbuild).
  // firebase-admin v14 CJS-to-ESM: named exports (.credential, .initializeApp,
  // .database, .auth, .apps) live on the module NAMESPACE object, not on .default.
  // Resolution: use namespace if it has .credential; fall back to .default only
  // for older shims that reverse this convention.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminPkg = (await import("firebase-admin")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = (adminPkg.credential ? adminPkg : (adminPkg.default ?? adminPkg)) as any;

  let app: unknown;
  const existingApps: unknown[] = admin.apps ?? adminPkg.default?.apps ?? [];
  if (existingApps.length > 0) {
    // Already initialised — reuse the instance.
    app = existingApps[0];
    logger.info("Firebase Admin: reusing existing app instance");
  } else {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL,
    });
    logger.info({ databaseURL }, "Firebase Admin: initialised");
  }

  _db = admin.database(app);
  _auth = admin.auth(app);
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
