/**
 * Root API router — mounts all route modules under /api
 *
 * Available endpoints:
 *   GET  /api/healthz                — health check (no auth)
 *   POST /api/notifications/send     — send OneSignal push (auth required)
 *   POST /api/wallet/init            — initialise user wallet (auth required)
 *   POST /api/wallet/send-gift       — transfer diamonds (auth required)
 *   POST /api/cloudinary/delete      — delete Cloudinary asset (auth required)
 *   POST /api/rooms/sync-counts      — sync voice room member counts (auth required)
 */

import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import notificationsRouter from "./notifications.js";
import walletRouter from "./wallet.js";
import cloudinaryRouter from "./cloudinary.js";
import roomsRouter from "./rooms.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notificationsRouter);
router.use(walletRouter);
router.use(cloudinaryRouter);
router.use(roomsRouter);

export default router;
