/**
 * Notifications route — POST /api/notifications/send
 *
 * Forwards a push notification request from an authenticated app client to the
 * OneSignal REST API.  The client sends the Firebase ID token so the server can
 * verify the caller is a legitimate signed-in user (RC8-A security fix).
 *
 * Env vars required (already set on Render dashboard):
 *   ONESIGNAL_APP_ID       — OneSignal application UUID
 *   ONESIGNAL_REST_API_KEY — OneSignal REST API key (server-side only)
 *
 * Never throws — a failed push must never surface to the end user.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const SendNotificationBody = z.object({
  /** Firebase UID of the notification recipient (used as OneSignal external_id) */
  externalUserId: z.string().min(1).max(256),
  /** Notification title — shown in the device notification tray */
  title: z.string().min(1).max(200),
  /** Notification body text */
  message: z.string().min(1).max(1000),
  /** Optional additional data payload delivered to the app on tap */
  data: z.record(z.unknown()).optional(),
});

router.post("/notifications/send", requireAuth, async (req, res) => {
  const parsed = SendNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { externalUserId, title, message, data } = parsed.data;

  const appId = process.env["ONESIGNAL_APP_ID"];
  const restApiKey = process.env["ONESIGNAL_REST_API_KEY"];

  if (!appId || !restApiKey) {
    req.log.warn("OneSignal env vars not configured — notification suppressed");
    // Return 200 so the client does not retry endlessly
    res.json({ ok: true, skipped: true });
    return;
  }

  try {
    const osRes = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [externalUserId],
        channel_for_external_user_ids: "push",
        headings: { en: title },
        contents: { en: message },
        data: data ?? {},
      }),
    });

    if (!osRes.ok) {
      const body = await osRes.json().catch(() => ({}));
      req.log.warn(
        { status: osRes.status, body },
        "OneSignal API returned a non-2xx response",
      );
    }

    // Always return 200 to the client — push delivery is best-effort.
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "notifications/send: OneSignal request failed");
    res.status(500).json({ error: "Failed to deliver notification" });
  }
});

export default router;
