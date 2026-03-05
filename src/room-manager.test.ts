import { describe, expect, it } from "bun:test";
import type { AgentRuntime } from "./agent/runtime.js";
import { Room } from "./core/room.js";
import { RoomManager } from "./room-manager.js";
import type { SceneComposer } from "./scene/contract.js";
import type { AgentConfig, ComposedScene, ComposeInput, SceneConfig } from "./types.js";

const testAgent: AgentConfig = {
  name: "test-agent",
  profileId: "prof-001",
  model: "claude-sonnet-4-6",
  maxTokens: 200,
  systemPrompt: "Test agent",
  triggers: {
    watchwords: ["test"],
    prioritySignals: ["@test-agent"],
    randomChance: 0,
  },
  energy: { max: 10, responseCost: 3, statusCost: 1, rechargeRate: 1 },
  initiative: { threshold: 100, increaseRate: 0 },
  cooldownTicks: 2,
  statusSignals: { idle: ["[waiting]"] },
  toolTier: "none",
  thinkingTolerance: 40,
};

const testScene: SceneConfig = {
  name: "Test Scene",
  mode: "deliberate",
  tickRate: 100,
  maxMessages: 50,
  orchestratorModel: "claude-sonnet-4-6",
  orchestratorMaxTokens: 300,
  orchestratorEscalationThreshold: 7,
  urgencyKeywords: [],
  modeMap: {},
  events: {},
  orchestratorSystemPrompt: "Coordinate.",
  description: "Test",
};

// Fake composer that returns a static scene (no pg dependency)
const fakeComposer: SceneComposer = {
  name: "fake",
  async compose(_input: ComposeInput): Promise<ComposedScene> {
    return {
      sceneConfig: testScene,
      agents: [testAgent],
      completionConditions: { maxTicks: 10, maxMessages: 50 },
      compositionMeta: { composer: "fake", durationMs: 1, agentsResolved: 1 },
    };
  },
};

// Fake runtime that returns canned responses (no API calls)
const fakeRuntime = {
  async getResponse() {
    return "Fake response";
  },
  async getOrchestratorResponse() {
    return "Fake orchestrator response";
  },
} as unknown as AgentRuntime;

describe("RoomManager", () => {
  it("creates a room and returns roomId", async () => {
    const manager = new RoomManager(fakeComposer, fakeRuntime);
    const roomId = await manager.createRoom({
      title: "Test",
      body: "Testing",
      agents: ["@test-agent"],
      domains: [],
    });
    expect(roomId).toBeTruthy();
    expect(roomId.length).toBeGreaterThan(0);
  });

  it("lists rooms after creation", async () => {
    const manager = new RoomManager(fakeComposer, fakeRuntime);
    await manager.createRoom({
      title: "Room 1",
      body: "First room",
      agents: ["@test-agent"],
      domains: [],
    });
    await manager.createRoom({
      title: "Room 2",
      body: "Second room",
      agents: ["@test-agent"],
      domains: [],
    });

    const rooms = manager.listRooms();
    expect(rooms.length).toBe(2);
    expect(rooms[0].status).toBe("pending");
  });

  it("starts and stops a room", async () => {
    const manager = new RoomManager(fakeComposer, fakeRuntime);
    const roomId = await manager.createRoom({
      title: "Test",
      body: "Testing",
      agents: ["@test-agent"],
      domains: [],
    });

    manager.startRoom(roomId);
    expect(manager.getRoomDetail(roomId).status).toBe("running");

    manager.stopRoom(roomId);
    expect(manager.getRoomDetail(roomId).status).toBe("stopped");
  });

  it("returns room detail with agents", async () => {
    const manager = new RoomManager(fakeComposer, fakeRuntime);
    const roomId = await manager.createRoom({
      title: "Test",
      body: "Testing",
      agents: ["@test-agent"],
      domains: [],
    });

    const detail = manager.getRoomDetail(roomId);
    expect(detail.agents.length).toBe(1);
    expect(detail.agents[0].name).toBe("test-agent");
    expect(detail.agents[0].fsm).toBe("IDLE");
  });

  it("injects messages into a room", async () => {
    const manager = new RoomManager(fakeComposer, fakeRuntime);
    const roomId = await manager.createRoom({
      title: "Test",
      body: "Testing",
      agents: ["@test-agent"],
      domains: [],
    });

    manager.injectMessage(roomId, "Hello agents!", "brian");
    const messages = manager.getMessages(roomId);
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe("Hello agents!");
  });

  it("destroys a room", async () => {
    const manager = new RoomManager(fakeComposer, fakeRuntime);
    const roomId = await manager.createRoom({
      title: "Test",
      body: "Testing",
      agents: ["@test-agent"],
      domains: [],
    });

    manager.destroyRoom(roomId);
    expect(() => manager.getRoomDetail(roomId)).toThrow("Room not found");
  });

  it("throws on unknown roomId", () => {
    const manager = new RoomManager(fakeComposer, fakeRuntime);
    expect(() => manager.getRoomDetail("nonexistent")).toThrow("Room not found");
  });

  it("shuts down cleanly", async () => {
    const manager = new RoomManager(fakeComposer, fakeRuntime);
    const roomId = await manager.createRoom({
      title: "Test",
      body: "Testing",
      agents: ["@test-agent"],
      domains: [],
    });
    manager.startRoom(roomId);
    await manager.shutdown();
    // Should not throw
  });
});
