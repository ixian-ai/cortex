import { describe, expect, it } from "bun:test";
import type { AgentRuntime } from "../agent/runtime.js";
import { RoomManager } from "../room-manager.js";
import type { SceneComposer } from "../scene/contract.js";
import type { AgentConfig, ComposedScene, ComposeInput, SceneConfig } from "../types.js";
import { createServer } from "./server.js";

const testAgent: AgentConfig = {
  name: "test-agent",
  model: "claude-sonnet-4-6",
  maxTokens: 200,
  systemPrompt: "Test",
  triggers: { watchwords: [], prioritySignals: [], randomChance: 0 },
  energy: { max: 10, responseCost: 3, statusCost: 1, rechargeRate: 1 },
  initiative: { threshold: 100, increaseRate: 0 },
  cooldownTicks: 2,
  statusSignals: { idle: ["..."] },
};

const testScene: SceneConfig = {
  name: "Test",
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

const fakeComposer: SceneComposer = {
  name: "fake",
  async compose(): Promise<ComposedScene> {
    return {
      sceneConfig: testScene,
      agents: [testAgent],
      completionConditions: { maxTicks: 10 },
      compositionMeta: { composer: "fake", durationMs: 1, agentsResolved: 1 },
    };
  },
};

const fakeRuntime = {
  async getResponse() {
    return "OK";
  },
  async getOrchestratorResponse() {
    return "OK";
  },
} as unknown as AgentRuntime;

function setup() {
  const manager = new RoomManager(fakeComposer, fakeRuntime);
  const handler = createServer(manager);
  return { manager, handler };
}

async function req(
  handler: (r: Request) => Promise<Response>,
  method: string,
  path: string,
  body?: unknown,
) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  return handler(new Request(`http://localhost${path}`, init));
}

describe("Cortex HTTP Server", () => {
  it("GET /health returns healthy", async () => {
    const { handler } = setup();
    const res = await req(handler, "GET", "/health");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.status).toBe("healthy");
    expect(data.service).toBe("cortex");
  });

  it("POST /rooms creates a room", async () => {
    const { handler } = setup();
    const res = await req(handler, "POST", "/rooms", {
      title: "Test Room",
      body: "Testing",
      agents: ["@test"],
      domains: [],
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.roomId).toBeTruthy();
    expect(data.status).toBe("running");
  });

  it("GET /rooms lists rooms", async () => {
    const { handler } = setup();
    await req(handler, "POST", "/rooms", {
      title: "Room 1",
      body: "Test",
      agents: ["@test"],
      domains: [],
    });
    const res = await req(handler, "GET", "/rooms");
    expect(res.status).toBe(200);
    const data = (await res.json()) as unknown[];
    expect(data.length).toBe(1);
  });

  it("GET /rooms/:id returns room detail", async () => {
    const { handler } = setup();
    const createRes = await req(handler, "POST", "/rooms", {
      title: "Detail Room",
      body: "Test",
      agents: ["@test"],
      domains: [],
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await req(handler, "GET", `/rooms/${roomId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.roomId).toBe(roomId);
  });

  it("POST /rooms/:id/messages injects a message", async () => {
    const { handler } = setup();
    const createRes = await req(handler, "POST", "/rooms", {
      title: "Msg Room",
      body: "Test",
      agents: ["@test"],
      domains: [],
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await req(handler, "POST", `/rooms/${roomId}/messages`, {
      content: "Hello agents",
      from: "brian",
    });
    expect(res.status).toBe(200);

    const msgsRes = await req(handler, "GET", `/rooms/${roomId}/messages`);
    const messages = (await msgsRes.json()) as unknown[];
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /rooms/:id/stop stops a room", async () => {
    const { handler } = setup();
    const createRes = await req(handler, "POST", "/rooms", {
      title: "Stop Room",
      body: "Test",
      agents: ["@test"],
      domains: [],
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await req(handler, "POST", `/rooms/${roomId}/stop`);
    expect(res.status).toBe(200);
  });

  it("DELETE /rooms/:id destroys a room", async () => {
    const { handler } = setup();
    const createRes = await req(handler, "POST", "/rooms", {
      title: "Delete Room",
      body: "Test",
      agents: ["@test"],
      domains: [],
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await req(handler, "DELETE", `/rooms/${roomId}`);
    expect(res.status).toBe(200);

    const getRes = await req(handler, "GET", `/rooms/${roomId}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for unknown routes", async () => {
    const { handler } = setup();
    const res = await req(handler, "GET", "/nope");
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown room", async () => {
    const { handler } = setup();
    const res = await req(handler, "GET", "/rooms/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing fields on POST /rooms", async () => {
    const { handler } = setup();
    const res = await req(handler, "POST", "/rooms", { title: "No agents" });
    expect(res.status).toBe(400);
  });
});
