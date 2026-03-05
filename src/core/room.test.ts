import { describe, expect, it } from "bun:test";
import type { AgentConfig, RoomConfig, SceneConfig } from "../types.js";
import { Room } from "./room.js";

const roomConfig: RoomConfig = {
  name: "test-room",
  tickRate: 100,
  maxMessages: 50,
  sceneEvents: [],
};

const sceneConfig: SceneConfig = {
  name: "test-scene",
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

const agentConfig: AgentConfig = {
  name: "test-agent",
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

describe("Room", () => {
  it("creates with a unique roomId", () => {
    const room = new Room(roomConfig);
    expect(room.roomId).toBeTruthy();
    expect(room.roomId.length).toBeGreaterThan(0);
  });

  it("starts in pending status", () => {
    const room = new Room(roomConfig);
    expect(room.status).toBe("pending");
  });

  it("accepts agent config via addAgent", () => {
    const room = new Room(roomConfig);
    room.addAgent(agentConfig);
    const agents = room.getAgents();
    expect(agents.has("test-agent")).toBe(true);
    expect(agents.get("test-agent")?.state.fsm).toBe("IDLE");
    expect(agents.get("test-agent")?.state.energy).toBe(10);
  });

  it("accepts scene config via constructor", () => {
    const room = new Room(roomConfig, sceneConfig);
    expect(room.sceneConfig).toBeTruthy();
    expect(room.sceneConfig?.mode).toBe("deliberate");
    expect(room.getSceneState()?.urgency).toBe(0);
  });

  it("injects messages", () => {
    const room = new Room(roomConfig);
    room.injectMessage("Hello room", "external");
    const messages = room.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe("Hello room");
    expect(messages[0].from).toBe("external");
  });

  it("trims messages to maxMessages", () => {
    const smallRoom = new Room({ ...roomConfig, maxMessages: 3 });
    for (let i = 0; i < 5; i++) {
      smallRoom.injectMessage(`msg-${i}`);
    }
    expect(smallRoom.getMessages().length).toBe(3);
  });

  it("transitions to running on start", () => {
    const room = new Room(roomConfig);
    room.start();
    expect(room.status).toBe("running");
    room.stop();
  });

  it("transitions to stopped on stop", () => {
    const room = new Room(roomConfig);
    room.start();
    room.stop();
    expect(room.status).toBe("stopped");
  });

  it("completes on maxTicks via manual tick", async () => {
    const room = new Room(roomConfig, null, { maxTicks: 3 });
    room.addAgent(agentConfig);

    let completed = false;
    room.onComplete(() => {
      completed = true;
    });

    // Manual start without clock
    room["_status"] = "running";
    room["startedAt"] = Date.now();

    for (let i = 1; i <= 4; i++) {
      await room.tick(i);
    }

    expect(completed).toBe(true);
    expect(room.status).toBe("completed");
  });

  it("triggers response handler when agent should respond", async () => {
    const room = new Room(roomConfig);
    room.addAgent(agentConfig);

    let responseRequested = false;
    room.onNeedResponse(async (agent, _context) => {
      responseRequested = true;
      return `Response from ${agent.config.name}`;
    });

    room["_status"] = "running";
    room["startedAt"] = Date.now();

    // Inject a message matching the agent's priority signal
    room.injectMessage("Hey @test-agent what do you think?", "user");

    // Allow async response to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(responseRequested).toBe(true);
    const messages = room.getMessages();
    const agentMessages = messages.filter((m) => m.from === "test-agent");
    expect(agentMessages.length).toBeGreaterThan(0);
  });
});
