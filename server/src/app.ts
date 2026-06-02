import "./lib/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.js";
import groupsRoutes from "./routes/groups.js";
import invitesRoutes from "./routes/invites.js";
import cronRoutes from "./routes/cron.js";
import notificationsRoutes from "./routes/notifications.js";
import homeRoutes from "./routes/home.js";
import devRoutes from "./routes/dev.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? true,
    credentials: true,
  }),
);
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", service: "kaban-api" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/groups", groupsRoutes);
app.use("/api/v1/invites", invitesRoutes);
app.use("/api/v1/notifications", notificationsRoutes);
app.use("/api/v1/home", homeRoutes);
app.use("/api/v1/cron", cronRoutes);

if (process.env.NODE_ENV !== "production") {
  app.use("/api/v1/dev", devRoutes);
}

app.use(errorHandler);

export default app;
