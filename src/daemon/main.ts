#!/usr/bin/env bun

/**
 * Cortex daemon — agent coordination engine.
 *
 * Usage:
 *   bun run cortex/src/daemon/main.ts                    # Unix socket (default)
 *   CORTEX_PORT=3200 bun run cortex/src/daemon/main.ts   # TCP for dev
 */

import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createPool } from "@ixian/pg-client";
import { createLogger } from "@ixian/telemetry";
import { AgentRuntime } from "../agent/runtime.js";
import { RoomManager } from "../room-manager.js";
import { BuiltinComposer } from "../scene/composer.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig();

// Create pg pool
const pool = createPool({ connectionString: config.databaseUrl });

// Anthropic client
let anthropicClient: Anthropic | undefined;
if (config.anthropicApiKey) {
  anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
} else if (process.env.ANTHROPIC_API_KEY) {
  anthropicClient = new Anthropic();
}

// Telemetry
const logger = createLogger("cortex", pool);

// Scene composer (MVP: resolves directly from pg)
const composer = new BuiltinComposer({ pool, client: anthropicClient });

// Agent runtime
const runtime = new AgentRuntime(anthropicClient);

// Room manager
const manager = new RoomManager(composer, runtime, logger);

// HTTP server
const handler = createServer(manager);

const port = process.env.CORTEX_PORT ? Number.parseInt(process.env.CORTEX_PORT, 10) : undefined;

if (port) {
  const server = Bun.serve({ port, fetch: handler });
  console.log(`[cortex] Listening on http://localhost:${server.port}`);
} else {
  const socketPath = config.socketPath;
  mkdirSync(dirname(socketPath), { recursive: true });
  if (existsSync(socketPath)) {
    unlinkSync(socketPath);
  }
  const _server = Bun.serve({ unix: socketPath, fetch: handler });
  console.log(`[cortex] Listening on ${socketPath}`);

  // Register in service registry
  try {
    await pool.query(
      `INSERT INTO ixian.service_registry (name, socket_path, pid, version)
       VALUES ('cortex', $1, $2, '0.1.0')
       ON CONFLICT (name) DO UPDATE SET socket_path = $1, pid = $2, heartbeat_at = now()`,
      [socketPath, process.pid],
    );
  } catch {
    // Non-fatal
  }
}

// Graceful shutdown
async function shutdown() {
  console.log("[cortex] Shutting down...");
  await manager.shutdown();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
