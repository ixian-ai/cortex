import { describe, expect, it } from "bun:test";
import type { AgentConfig, AgentState, EngineEvent } from "../types.js";
import { evaluateFSM, tickState } from "./fsm.js";

const defaultConfig: AgentConfig = {
  name: "test-agent",
  model: "claude-sonnet-4-6",
  maxTokens: 200,
  systemPrompt: "You are a test agent.",
  triggers: {
    watchwords: ["deploy", "review"],
    prioritySignals: ["@test-agent", "@everyone"],
    randomChance: 0,
  },
  energy: {
    max: 10,
    responseCost: 3,
    statusCost: 1,
    rechargeRate: 1,
  },
  initiative: {
    threshold: 5,
    increaseRate: 0.5,
  },
  cooldownTicks: 2,
  statusSignals: { idle: ["[analyzing...]"], contextual: ["[reviewing context]"] },
};

const defaultState: AgentState = {
  fsm: "IDLE",
  energy: 10,
  initiative: 0,
  mood: 0,
  cooldownRemaining: 0,
  lastSpoke: 0,
  attention: [],
};

describe("evaluateFSM", () => {
  it("transitions IDLE → RESPONDING on HIGH relevance message with energy", () => {
    const event: EngineEvent = {
      type: "message",
      from: "user",
      content: "Hey @test-agent what do you think?",
      timestamp: Date.now(),
    };
    const result = evaluateFSM(event, defaultState, defaultConfig);
    expect(result.nextState).toBe("RESPONDING");
    expect(result.action).toBe("respond");
  });

  it("transitions IDLE → STATUS_SIGNAL on HIGH relevance with no energy", () => {
    const lowEnergy = { ...defaultState, energy: 1 };
    const event: EngineEvent = {
      type: "message",
      from: "user",
      content: "@test-agent please respond",
      timestamp: Date.now(),
    };
    const result = evaluateFSM(event, lowEnergy, defaultConfig);
    expect(result.nextState).toBe("STATUS_SIGNAL");
    expect(result.action).toBe("signal");
  });

  it("transitions IDLE → RESPONDING on watchword match with energy", () => {
    const event: EngineEvent = {
      type: "message",
      from: "user",
      content: "We need to deploy the new version",
      timestamp: Date.now(),
    };
    const result = evaluateFSM(event, defaultState, defaultConfig);
    expect(result.nextState).toBe("RESPONDING");
    expect(result.action).toBe("respond");
  });

  it("stays IDLE on irrelevant message", () => {
    const event: EngineEvent = {
      type: "message",
      from: "user",
      content: "Nice weather today",
      timestamp: Date.now(),
    };
    const result = evaluateFSM(event, defaultState, defaultConfig);
    expect(result.nextState).toBe("IDLE");
  });

  it("transitions IDLE → RESPONDING on initiative threshold exceeded", () => {
    const highInitiative = { ...defaultState, initiative: 6 };
    const event: EngineEvent = { type: "tick", tickNumber: 10, timestamp: Date.now() };
    const result = evaluateFSM(event, highInitiative, defaultConfig);
    expect(result.nextState).toBe("RESPONDING");
    expect(result.action).toBe("initiate");
  });

  it("transitions IDLE → RESPONDING on scene event (NMI)", () => {
    const event: EngineEvent = { type: "scene", content: "Alert raised", timestamp: Date.now() };
    const result = evaluateFSM(event, defaultState, defaultConfig);
    expect(result.nextState).toBe("RESPONDING");
    expect(result.action).toBe("respond");
  });

  it("transitions IDLE → RESPONDING on orchestrator directive targeting agent", () => {
    const event: EngineEvent = {
      type: "orchestrator_directive",
      target: "test-agent",
      directive: "Summarize findings",
      timestamp: Date.now(),
    };
    const result = evaluateFSM(event, defaultState, defaultConfig);
    expect(result.nextState).toBe("RESPONDING");
    expect(result.action).toBe("respond");
  });

  it("stays IDLE on orchestrator directive targeting someone else", () => {
    const event: EngineEvent = {
      type: "orchestrator_directive",
      target: "other-agent",
      directive: "Summarize findings",
      timestamp: Date.now(),
    };
    const result = evaluateFSM(event, defaultState, defaultConfig);
    expect(result.nextState).toBe("IDLE");
  });

  it("stays RESPONDING while in RESPONDING state", () => {
    const responding = { ...defaultState, fsm: "RESPONDING" as const };
    const event: EngineEvent = { type: "tick", tickNumber: 5, timestamp: Date.now() };
    const result = evaluateFSM(event, responding, defaultConfig);
    expect(result.nextState).toBe("RESPONDING");
  });

  it("transitions COOLDOWN → IDLE when cooldown expires", () => {
    const cooling = { ...defaultState, fsm: "COOLDOWN" as const, cooldownRemaining: 1 };
    const event: EngineEvent = { type: "tick", tickNumber: 5, timestamp: Date.now() };
    const result = evaluateFSM(event, cooling, defaultConfig);
    expect(result.nextState).toBe("IDLE");
  });

  it("stays COOLDOWN when ticks remaining", () => {
    const cooling = { ...defaultState, fsm: "COOLDOWN" as const, cooldownRemaining: 3 };
    const event: EngineEvent = { type: "tick", tickNumber: 5, timestamp: Date.now() };
    const result = evaluateFSM(event, cooling, defaultConfig);
    expect(result.nextState).toBe("COOLDOWN");
  });
});

describe("tickState", () => {
  it("recharges energy up to max", () => {
    const state = { ...defaultState, energy: 5 };
    const next = tickState(state, defaultConfig);
    expect(next.energy).toBe(6);
  });

  it("caps energy at max", () => {
    const next = tickState(defaultState, defaultConfig);
    expect(next.energy).toBe(10);
  });

  it("increases initiative", () => {
    const next = tickState(defaultState, defaultConfig);
    expect(next.initiative).toBe(0.5);
  });

  it("decrements cooldown", () => {
    const state = { ...defaultState, cooldownRemaining: 3 };
    const next = tickState(state, defaultConfig);
    expect(next.cooldownRemaining).toBe(2);
  });

  it("decays positive mood toward zero", () => {
    const state = { ...defaultState, mood: 0.5 };
    const next = tickState(state, defaultConfig);
    expect(next.mood).toBe(0.49);
  });
});
