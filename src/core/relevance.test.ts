import { describe, expect, it } from "bun:test";
import type { AgentConfig } from "../types.js";
import { evaluateRelevance } from "./relevance.js";

const config: AgentConfig = {
  name: "devops",
  model: "claude-sonnet-4-6",
  maxTokens: 200,
  systemPrompt: "DevOps agent",
  triggers: {
    watchwords: ["deploy", "kubernetes", "pipeline"],
    prioritySignals: ["@devops", "@everyone"],
    randomChance: 0,
  },
  energy: { max: 10, responseCost: 3, statusCost: 1, rechargeRate: 1 },
  initiative: { threshold: 5, increaseRate: 0.5 },
  cooldownTicks: 2,
  statusSignals: { idle: ["..."] },
  toolTier: "none",
  thinkingTolerance: 40,
};

describe("evaluateRelevance", () => {
  it("returns HIGH for priority signal match", () => {
    expect(evaluateRelevance("Hey @devops can you check this?", "user", config)).toBe("HIGH");
  });

  it("returns HIGH for @everyone", () => {
    expect(evaluateRelevance("@everyone please review", "user", config)).toBe("HIGH");
  });

  it("returns MEDIUM for watchword match", () => {
    expect(evaluateRelevance("We need to deploy the new service", "user", config)).toBe("MEDIUM");
  });

  it("returns MEDIUM for watchword with word boundary", () => {
    expect(evaluateRelevance("The kubernetes cluster is down", "user", config)).toBe("MEDIUM");
  });

  it("returns NONE for irrelevant message with randomChance=0", () => {
    expect(evaluateRelevance("Nice weather today", "user", config)).toBe("NONE");
  });

  it("priority signals are case-insensitive", () => {
    expect(evaluateRelevance("Hey @DEVOPS check this", "user", config)).toBe("HIGH");
  });

  it("watchwords are case-insensitive", () => {
    expect(evaluateRelevance("DEPLOY NOW", "user", config)).toBe("MEDIUM");
  });
});
