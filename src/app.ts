import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

/* ─── Structured request logging ────────────────────────────────────────── */

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

/* ─── CORS ───────────────────────────────────────────────────────────────── */

app.use(cors());

/* ─── Body parsing ───────────────────────────────────────────────────────── */

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

/* ─── Rate limiting ──────────────────────────────────────────────────────── */
// Protects against abuse and brute-force; all limits are per IP.

/** General limit covering the full /api surface */
const globalLimiter = rateLimit({
  windowMs: 60_000,  // 1 minute
  max: 120,          // 120 req/min — generous for normal app usage
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
});

/** Tighter limit on the notification endpoint to prevent push spam */
const notifyLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many notification requests" },
});

/** Wallet mutations — tighter to prevent balance manipulation attempts */
const walletLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many wallet requests" },
});

app.use("/api", globalLimiter);
app.use("/api/notifications", notifyLimiter);
app.use("/api/wallet", walletLimiter);

/* ─── Routes ─────────────────────────────────────────────────────────────── */

app.use("/api", router);

export default app;
