import type { AgentConfig, RelevanceLevel } from "../types.js";

/**
 * Zero-cost relevance evaluation — pure string matching, no API calls.
 * Determines how relevant an incoming message is to an agent based on
 * watchwords, direct mentions, and random chance.
 */
export function evaluateRelevance(
  message: string,
  from: string,
  config: AgentConfig,
): RelevanceLevel {
  const lower = message.toLowerCase();

  // 1. Priority signal triggers (exact substring, case-insensitive)
  for (const trigger of config.triggers.prioritySignals) {
    if (lower.includes(trigger.toLowerCase())) {
      return "HIGH";
    }
  }

  // 2. Direct @mention of the agent name
  const mentionPattern = `@${config.name.toLowerCase()}`;
  if (lower.includes(mentionPattern)) {
    return "HIGH";
  }

  // 3. Watchword triggers (word-boundary aware, case-insensitive)
  for (const keyword of config.triggers.watchwords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(message)) {
      return "MEDIUM";
    }
  }

  // 4. Random chance roll
  if (Math.random() < config.triggers.randomChance) {
    return "LOW";
  }

  return "NONE";
}
