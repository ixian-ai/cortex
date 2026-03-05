import { describe, expect, it } from "bun:test";
import type { AgentProfileRow } from "@ixian/signal-resolver";
import { profileToAgentConfig } from "./composer.js";

const sampleProfile: AgentProfileRow = {
  id: "prof-001",
  seed: "devops",
  signal_type: "role",
  display_name: "DevOps Engineer",
  description: "Infrastructure and deployment specialist",
  tags: ["deploy", "kubernetes", "ci-cd", "infrastructure"],
  source: "import",
  body: "You are a DevOps engineer focused on infrastructure reliability and deployment automation.",
  use_count: 5,
  last_used_at: new Date(),
  spec_origin: null,
  created_at: new Date(),
  updated_at: new Date(),
  meta: {},
};

describe("profileToAgentConfig", () => {
  it("maps display_name to name", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.name).toBe("DevOps Engineer");
  });

  it("maps id to profileId", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.profileId).toBe("prof-001");
  });

  it("maps body to systemPrompt", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.systemPrompt).toContain("DevOps engineer");
  });

  it("maps tags to watchwords", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.triggers.watchwords).toEqual(["deploy", "kubernetes", "ci-cd", "infrastructure"]);
  });

  it("builds prioritySignals from seed", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.triggers.prioritySignals).toContain("@devops");
    expect(config.triggers.prioritySignals).toContain("@everyone");
  });

  it("uses defaults for energy when meta is empty", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.energy.max).toBe(10);
    expect(config.energy.responseCost).toBe(3);
    expect(config.energy.statusCost).toBe(1);
    expect(config.energy.rechargeRate).toBe(1);
  });

  it("uses defaults for initiative when meta is empty", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.initiative.threshold).toBe(5);
    expect(config.initiative.increaseRate).toBe(0.5);
  });

  it("defaults model to claude-sonnet-4-6", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.model).toBe("claude-sonnet-4-6");
  });

  it("respects meta overrides for model", () => {
    const withModel: AgentProfileRow = {
      ...sampleProfile,
      meta: { model: "claude-haiku-4-5-20251001" },
    };
    const config = profileToAgentConfig(withModel);
    expect(config.model).toBe("claude-haiku-4-5-20251001");
  });

  it("respects meta overrides for energy", () => {
    const withEnergy: AgentProfileRow = {
      ...sampleProfile,
      meta: { energy: { max: 20, responseCost: 5, statusCost: 2, rechargeRate: 2 } },
    };
    const config = profileToAgentConfig(withEnergy);
    expect(config.energy.max).toBe(20);
    expect(config.energy.responseCost).toBe(5);
  });

  it("provides default statusSignals", () => {
    const config = profileToAgentConfig(sampleProfile);
    expect(config.statusSignals.idle.length).toBeGreaterThan(0);
    expect(config.statusSignals.contextual.length).toBeGreaterThan(0);
  });
});
