import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./types";
import { handleScheduled } from "./cron";
import { rateLimiter } from "./rate-limit";

import pushRoutes from "./routes/push";
import messageRoutes from "./routes/messages";
import recipientRoutes from "./routes/recipients";
import subscribeRoutes from "./routes/subscribe";
import configRoutes from "./routes/config";
import imageProxyRoutes from "./routes/image-proxy";

const app = new Hono<{ Bindings: Env }>();

// --- Middleware ---
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));
app.use("*", logger());
app.use("/api/*", rateLimiter());

// --- Health check ---
app.get("/", (c) => c.json({
  name: "hx-houtiku-api",
  version: "1.0.0",
  status: "ok",
}));

// --- API Routes ---
app.route("/api/push", pushRoutes);
app.route("/api/messages", messageRoutes);
app.route("/api/recipients", recipientRoutes);
app.route("/api/subscribe", subscribeRoutes);
app.route("/api/config", configRoutes);
app.route("/api/image-proxy", imageProxyRoutes);

// --- 404 ---
app.notFound((c) => c.json({ error: "Not found" }, 404));

// --- Error handler ---
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// --- Export ---
export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Env) => {
    await handleScheduled(env);
  },
};
