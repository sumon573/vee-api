import { Router, type IRouter } from "express";
import { z } from "zod";

// Inline schema (HealthCheckResponse)
const HealthCheckResponse = z.object({
  status: z.string(),
});

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
