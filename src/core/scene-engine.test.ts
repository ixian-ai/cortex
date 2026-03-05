import { describe, expect, it } from "bun:test";
import type { RoomMessage, SceneConfig } from "../types.js";
import {
  analyzeConversation,
  createSceneState,
  shouldEscalateToOrchestrator,
  tickSceneState,
} from "./scene-engine.js";

const sceneConfig: SceneConfig = {
  name: "test-scene",
  mode: "deliberate",
  tickRate: 5000,
  maxMessages: 200,
  orchestratorModel: "claude-sonnet-4-6",
  orchestratorMaxTokens: 300,
  orchestratorEscalationThreshold: 7,
  urgencyKeywords: ["critical", "emergency", "blocked"],
  modeMap: {
    urgent: ["asap", "immediately", "now"],
    creative: ["brainstorm", "idea", "explore"],
  },
  events: {},
  orchestratorSystemPrompt: "Coordinate agents.",
  description: "Test scene",
};

function makeMessage(content: string, from = "user"): RoomMessage {
  return { id: "1", type: "message", from, content, timestamp: Date.now() };
}

describe("analyzeConversation", () => {
  it("detects urgency keywords", () => {
    const messages = [makeMessage("This is critical, we need to fix it")];
    const result = analyzeConversation(messages, sceneConfig);
    expect(result.urgencyDelta).toBe(1);
  });

  it("detects mode from modeMap", () => {
    const messages = [makeMessage("Let's brainstorm some ideas")];
    const result = analyzeConversation(messages, sceneConfig);
    expect(result.detectedMode).toBe("creative");
  });

  it("returns null mode when no keywords match", () => {
    const messages = [makeMessage("Normal conversation here")];
    const result = analyzeConversation(messages, sceneConfig);
    expect(result.detectedMode).toBeNull();
  });
});

describe("tickSceneState", () => {
  it("increments pacing and ticksSinceLastOrchestrator", () => {
    const state = createSceneState(sceneConfig);
    const next = tickSceneState(state, [], sceneConfig);
    expect(next.pacing).toBe(1);
    expect(next.ticksSinceLastOrchestrator).toBe(1);
  });

  it("raises urgency on keyword hits", () => {
    const state = createSceneState(sceneConfig);
    const messages = [makeMessage("critical emergency blocked")];
    const next = tickSceneState(state, messages, sceneConfig);
    expect(next.urgency).toBeGreaterThan(0);
  });

  it("shifts mode to urgent when urgency > 6", () => {
    const state = { ...createSceneState(sceneConfig), urgency: 7 };
    const next = tickSceneState(state, [], sceneConfig);
    expect(next.currentMode).toBe("urgent");
  });
});

describe("shouldEscalateToOrchestrator", () => {
  it("returns true when all conditions met", () => {
    const state = {
      urgency: 8,
      currentMode: "urgent",
      pacing: 5,
      ticksSinceLastOrchestrator: 7,
    };
    expect(shouldEscalateToOrchestrator(state, sceneConfig)).toBe(true);
  });

  it("returns false when urgency below threshold", () => {
    const state = {
      urgency: 3,
      currentMode: "deliberate",
      pacing: 5,
      ticksSinceLastOrchestrator: 7,
    };
    expect(shouldEscalateToOrchestrator(state, sceneConfig)).toBe(false);
  });

  it("returns false when pacing too low", () => {
    const state = {
      urgency: 8,
      currentMode: "urgent",
      pacing: 2,
      ticksSinceLastOrchestrator: 7,
    };
    expect(shouldEscalateToOrchestrator(state, sceneConfig)).toBe(false);
  });
});

describe("createSceneState", () => {
  it("creates initial state from config", () => {
    const state = createSceneState(sceneConfig);
    expect(state.urgency).toBe(0);
    expect(state.currentMode).toBe("deliberate");
    expect(state.pacing).toBe(0);
    expect(state.ticksSinceLastOrchestrator).toBe(0);
  });
});
