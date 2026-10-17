import "./lib/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.js";
import groupsRoutes from "./routes/groups.js";
import invitesRoutes from "./routes/invites.js";
import cronRoutes from "./routes/cron.js";
import notificationsRoutes from "./routes/notifications.js";
import devRoutes from "./routes/dev.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { resolveCorsOrigin } from "./lib/origin.js";
import { serverTiming } from "./lib/timing.js";

const app = express();
// Vercel's proxy sets X-Forwarded-For; trust that one hop so req.ip (and the auth rate limits
// keyed on it) is the real client instead of one shared proxy address.
app.set("trust proxy", 1);

app.use(serverTiming);
app.use(helmet());
app.use(
  cors({
    origin: resolveCorsOrigin(),
    credentials: true,
  }),
);
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", service: "kaban-api" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/groups", groupsRoutes);
app.use("/api/v1", invitesRoutes);
app.use("/api/v1/notifications", notificationsRoutes);
app.use("/api/v1/cron", cronRoutes);

// Always mounted: requireDemoTools decides per request, so ALLOW_DEMO_TOOLS can turn them on in production.
app.use("/api/v1/dev", devRoutes);

app.use(errorHandler);

export default app;
