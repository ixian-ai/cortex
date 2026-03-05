import { join } from "node:path";
import { cacheHome } from "@ixian/shared-types";

const NAMESPACE = "ixian";

export interface CortexConfig {
  socketPath: string;
  databaseUrl: string;
  anthropicApiKey?: string;
  tickRate: number;
  defaultMaxTicks: number;
  defaultMaxMessages: number;
  defaultMaxDurationMs: number;
}

export function defaultSocketPath(): string {
  return join(cacheHome(NAMESPACE), "cortex.sock");
}

export function loadConfig(): CortexConfig {
  const socketPath = process.env.CORTEX_SOCKET ?? defaultSocketPath();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  return {
    socketPath,
    databaseUrl,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    tickRate: process.env.CORTEX_TICK_RATE
      ? Number.parseInt(process.env.CORTEX_TICK_RATE, 10)
      : 5000,
    defaultMaxTicks: 100,
    defaultMaxMessages: 200,
    defaultMaxDurationMs: 600_000,
  };
}
