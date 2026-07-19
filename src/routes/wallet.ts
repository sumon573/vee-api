/**
 * Wallet routes
 *
 *   POST /api/wallet/init        — initialise a new user wallet (500 diamonds, idempotent)
 *   POST /api/wallet/send-gift   — atomically transfer diamonds from caller to recipients
 *
 * SECURITY: all wallet mutations are server-side only.  Firebase Security Rules
 * block direct client writes to wallets/{uid}/balance and
 * wallets/{uid}/weeklyEarned.  The Admin SDK bypasses those rules on behalf of
 * verified, authenticated callers.
 *
 * Firebase RTDB structure used:
 *   wallets/{uid}/balance           — number  (spendable diamonds)
 *   wallets/{uid}/weeklyEarned      — number  (received this week, resets on weekStart)
 *   wallets/{uid}/weekStart         — number  (epoch ms of the current week boundary)
 *   wallets/{uid}/transactions/{id} — WalletTransaction
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";
import { getAdminDb } from "../lib/firebase-admin.js";

const router = Router();

/* ─── POST /wallet/init ──────────────────────────────────────────────────── */

router.post("/wallet/init", requireAuth, async (req, res) => {
  const uid = req.uid!;

  try {
    const db = await getAdminDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const balRef = db.ref(`wallets/${uid}/balance`);

    // Atomic: write 500 only if no wallet exists yet (current === null).
    // If the wallet already exists the transaction is a no-op.
    await balRef.transaction((current: number | null) =>
      current === null ? 500 : current,
    );

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, uid }, "wallet/init failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ─── POST /wallet/send-gift ─────────────────────────────────────────────── */

const RecipientSchema = z.object({
  uid: z.string().min(1).max(128),
  name: z.string().max(100),
});

const SendGiftBody = z.object({
  recipients: z.array(RecipientSchema).min(1).max(20),
  giftEmoji: z.string().min(1).max(10),
  giftName: z.string().min(1).max(100),
  /** Diamonds cost per recipient (positive integer) */
  diamondsEach: z.number().int().min(1).max(100_000),
  roomId: z.string().max(128).nullable().optional(),
});

router.post("/wallet/send-gift", requireAuth, async (req, res) => {
  const senderUid = req.uid!;

  const parsed = SendGiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { recipients, giftEmoji, giftName, diamondsEach, roomId } = parsed.data;
  const totalCost = diamondsEach * recipients.length;

  try {
    const db = await getAdminDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    /* ── 1. Atomically check + deduct sender balance ── */
    const senderBalRef = db.ref(`wallets/${senderUid}/balance`);
    let deducted = false;

    const txResult = await senderBalRef.transaction(
      (current: number | null) => {
        const balance = current ?? 0;
        if (balance < totalCost) return; // undefined → abort
        deducted = true;
        return balance - totalCost;
      },
    );

    if (!txResult.committed || !deducted) {
      res.status(400).json({ error: "Insufficient diamonds" });
      return;
    }

    /* ── 2. Look up sender display name for recipient records ── */
    const senderSnap = await db.ref(`users/${senderUid}/displayName`).once("value");
    const senderName = (senderSnap.val() as string | null) ?? "";

    /* ── 3. Fan-out: credit recipients + write transaction records ── */
    const ts = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};

    // Import ServerValue for atomic server-side increments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = (await import("firebase-admin")) as any;
    const ServerValue = admin.database.ServerValue as { increment: (n: number) => unknown };

    // Sender transaction record
    const senderTxKey = db.ref("wallets").push().key as string;
    updates[`wallets/${senderUid}/transactions/${senderTxKey}`] = {
      type: "gift_sent",
      diamonds: -totalCost,
      emoji: giftEmoji,
      giftName,
      // Store primary recipient as the counterpart in the sender's ledger
      counterpartUid: recipients[0].uid,
      counterpartName: recipients[0].name,
      roomId: roomId ?? null,
      ts,
    };

    // Recipient credits + transaction records
    for (const recipient of recipients) {
      // ServerValue.increment is atomic on the server — safe under concurrent gifts
      updates[`wallets/${recipient.uid}/balance`] = ServerValue.increment(diamondsEach);
      updates[`wallets/${recipient.uid}/weeklyEarned`] = ServerValue.increment(diamondsEach);

      const recipTxKey = db.ref("wallets").push().key as string;
      updates[`wallets/${recipient.uid}/transactions/${recipTxKey}`] = {
        type: "gift_received",
        diamonds: diamondsEach,
        emoji: giftEmoji,
        giftName,
        counterpartUid: senderUid,
        counterpartName: senderName,
        roomId: roomId ?? null,
        ts,
      };
    }

    // Single multi-path update — all writes land atomically (fan-out)
    await db.ref("/").update(updates);

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, senderUid }, "wallet/send-gift failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
