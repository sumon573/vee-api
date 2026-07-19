/**
 * Rooms route — POST /api/rooms/sync-counts
 *
 * Counts the current speaker seats and audience members of a voice room using
 * the Firebase Admin SDK (which bypasses Security Rules), then writes the
 * updated totals back to rooms/{roomId}/info.
 *
 * RC8-B2 fix for P2-2: seat holders are neither the room owner nor in the
 * audience list, so their direct Firebase writes are rejected by Security Rules.
 * Routing the count update through this server endpoint resolves that race.
 *
 * Firebase RTDB paths read:
 *   rooms/{roomId}/seats    — speaker seat occupants
 *   rooms/{roomId}/audience — passive listeners
 *
 * Firebase RTDB paths written:
 *   rooms/{roomId}/info.memberCount
 *   rooms/{roomId}/info.listenerCount
 *   rooms/{roomId}/info.memberPreviews  — first 5 seat holders (initials + color)
 *   rooms/{roomId}/info.isTrending      — true when memberCount >= 5
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";
import { getAdminDb } from "../lib/firebase-admin.js";

const router = Router();

const SyncCountsBody = z.object({
  roomId: z.string().min(1).max(256),
});

type MemberPreview = { initials: string; color: string };

router.post("/rooms/sync-counts", requireAuth, async (req, res) => {
  const parsed = SyncCountsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { roomId } = parsed.data;

  try {
    const db = await getAdminDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    // Fetch seats and audience in parallel for speed
    const [seatsSnap, audSnap] = await Promise.all([
      db.ref(`rooms/${roomId}/seats`).once("value"),
      db.ref(`rooms/${roomId}/audience`).once("value"),
    ]);

    let memberCount = 0;
    const memberPreviews: MemberPreview[] = [];

    if (seatsSnap.exists()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      seatsSnap.forEach((child: any) => {
        const seat = child.val() as { initials?: string; color?: string } | null;
        if (seat) {
          memberCount++;
          if (memberPreviews.length < 5) {
            memberPreviews.push({
              initials: seat.initials ?? "?",
              color: seat.color ?? "#888888",
            });
          }
        }
      });
    }

    let listenerCount = 0;
    if (audSnap.exists()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audSnap.forEach((_child: any) => {
        listenerCount++;
      });
    }

    await db.ref(`rooms/${roomId}/info`).update({
      memberCount,
      listenerCount,
      memberPreviews,
      isTrending: memberCount >= 5,
    });

    res.json({ ok: true, memberCount, listenerCount });
  } catch (err) {
    req.log.error({ err, roomId }, "rooms/sync-counts failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
