import { Hono } from "hono";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

// GET /api/config — public configuration (no auth required)
app.get("/", (c) => {
  return c.json({
    vapid_public_key: c.env.VAPID_PUBLIC_KEY,
    version: "1.0.0",
    encryption_curve: c.env.ENCRYPTION_CURVE || "secp256k1",
  });
});

export default app;
