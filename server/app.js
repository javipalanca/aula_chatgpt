#!/usr/bin/env node
import express from 'express'
import cors from 'cors'

// Create and export an Express app instance so tests can import it without
// starting the HTTP server. Keep this file minimal: middleware and router
// mounting will happen here; specific routes/controllers are added later.

const app = express()
app.use(cors())
app.use(express.json())

// Lightweight healthcheck for smoke testing
app.get('/health', (req, res) => res.json({ ok: true }))

export default app
