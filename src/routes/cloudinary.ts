/**
 * Cloudinary route — POST /api/cloudinary/delete
 *
 * Deletes a Cloudinary asset by publicId using a signed request.
 * Callers must supply a valid Firebase ID token — unauthenticated
 * requests are rejected with 401.
 *
 * Env vars required (already set on Render dashboard):
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * RC8-B1 security fix: previously the delete endpoint was unauthenticated.
 * The requireAuth middleware now ensures only signed-in users can trigger
 * deletions, and only via this server (API key/secret never sent to clients).
 */

import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const DeleteBody = z.object({
  publicId: z
    .string()
    .min(1)
    .max(512)
    .refine((v) => !v.startsWith("local_"), {
      message: "Local placeholder IDs cannot be deleted",
    }),
});

router.post("/cloudinary/delete", requireAuth, async (req, res) => {
  const parsed = DeleteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { publicId } = parsed.data;

  const cloudName = process.env["CLOUDINARY_CLOUD_NAME"];
  const apiKey = process.env["CLOUDINARY_API_KEY"];
  const apiSecret = process.env["CLOUDINARY_API_SECRET"];

  if (!cloudName || !apiKey || !apiSecret) {
    req.log.warn("Cloudinary env vars not configured — delete suppressed");
    // Return 200 so the app does not surface an error to the user.
    // Stale assets will be cleaned up by a server-side job.
    res.json({ ok: true, skipped: true });
    return;
  }

  try {
    const timestamp = Math.round(Date.now() / 1000);

    // Cloudinary signed-delete signature: SHA-1 of canonical parameter string + secret
    const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash("sha1").update(signatureString).digest("hex");

    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: timestamp.toString(),
      api_key: apiKey,
      signature,
    });

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: "POST",
        body,
      },
    );

    if (!cloudRes.ok) {
      const errBody = await cloudRes.json().catch(() => ({}));
      req.log.warn(
        { status: cloudRes.status, publicId, errBody },
        "Cloudinary destroy returned a non-2xx response",
      );
      res.status(cloudRes.status).json({ error: "Cloudinary delete failed" });
      return;
    }

    const result = await cloudRes.json().catch(() => ({ result: "unknown" }));
    req.log.info({ publicId, result: (result as { result?: string }).result }, "Cloudinary asset deleted");

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, publicId }, "cloudinary/delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
