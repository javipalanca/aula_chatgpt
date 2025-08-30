#!/usr/bin/env node
import express from "express";
import cors from "cors";

// Create and export an Express app instance so tests can import it without
// starting the HTTP server. Keep this file minimal: middleware and router
// mounting will happen here; specific routes/controllers are added later.

export default function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Lightweight healthcheck for smoke testing
  app.get("/health", (req, res) => res.json({ ok: true }));

  // Controllers should be mounted by the composition root (server/index.js)
  // or explicitly by tests using `app.use('/api/xxx', controller)`.

  return app;
}
