import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startRoomCleanupJob } from "./jobs/roomCleanup.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start room session cleanup job.
// Requires FIREBASE_SERVICE_ACCOUNT env var (JSON string of service account).
// Gracefully disabled when env var is absent (logs a warning, server continues).
startRoomCleanupJob().catch((err) => {
  logger.warn({ err }, "Room cleanup job failed to start — continuing without it");
});

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Vee API Server listening");
});
