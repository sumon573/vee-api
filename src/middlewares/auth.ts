/**
 * Firebase ID-token verification middleware.
 *
 * Reads the Bearer token from the Authorization header, verifies it with the
 * Firebase Admin Auth SDK, and attaches `req.uid` (the caller's Firebase UID)
 * to the request.  Returns 401 if the token is absent, malformed, or invalid.
 *
 * Usage:
 *   router.post('/wallet/init', requireAuth, handler);
 */

import type { Request, Response, NextFunction } from "express";
import { getAdminAuth } from "../lib/firebase-admin.js";

// Augment the Express Request type with our custom uid field.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      uid?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized — missing Bearer token" });
    return;
  }

  const idToken = authHeader.slice(7);

  try {
    const auth = await getAdminAuth();
    if (!auth) {
      // Firebase Admin is not configured (missing env var) — cannot verify tokens
      res.status(503).json({ error: "Auth service unavailable" });
      return;
    }

    const decoded = await auth.verifyIdToken(idToken);
    req.uid = decoded.uid as string;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized — invalid or expired token" });
  }
}
