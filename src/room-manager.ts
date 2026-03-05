import type { AuditLogger } from "@ixian/telemetry";
import type { AgentRuntime } from "./agent/runtime.js";
import { Room } from "./core/room.js";
import type { SceneComposer } from "./scene/contract.js";
import type { ComposeInput, RoomMessage, RoomStatus } from "./types.js";

export interface RoomSummary {
  roomId: string;
  name: string;
  status: RoomStatus;
  agentCount: number;
  messageCount: number;
  startedAt: number | null;
}

export interface RoomDetail extends RoomSummary {
  agents: Array<{
    name: string;
    profileId?: string;
    fsm: string;
    energy: number;
    initiative: number;
  }>;
  messages: RoomMessage[];
  sceneState: {
    urgency: number;
    currentMode: string;
    pacing: number;
  } | null;
}

/**
 * RoomManager — multi-room lifecycle coordinator.
 * Creates, starts, stops rooms. Wires up response handlers and telemetry.
 */
export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private startTimes: Map<string, number> = new Map();
  private composer: SceneComposer;
  private runtime: AgentRuntime;
  private logger?: AuditLogger;

  constructor(composer: SceneComposer, runtime: AgentRuntime, logger?: AuditLogger) {
    this.composer = composer;
    this.runtime = runtime;
    this.logger = logger;
  }

  async createRoom(input: ComposeInput): Promise<string> {
    const scene = await this.composer.compose(input);
    const room = new Room(
      {
        name: scene.sceneConfig.name,
        tickRate: scene.sceneConfig.tickRate,
        maxMessages: scene.sceneConfig.maxMessages,
        sceneEvents: [],
      },
      scene.sceneConfig,
      scene.completionConditions,
    );

    // Add resolved agents
    for (const agentConfig of scene.agents) {
      room.addAgent(agentConfig);
    }

    // Wire response handler
    room.onNeedResponse(async (agent, context) => {
      const isInitiation = agent.state.initiative >= agent.config.initiative.threshold;
      const response = await this.runtime.getResponse(agent, context, isInitiation);

      // Log to telemetry
      if (this.logger) {
        await this.logger.event("cortex.agent.responded", {
          sessionId: room.roomId,
          agentName: agent.config.name,
          profileId: agent.config.profileId,
          isInitiation,
        });

        await this.logger.conversation({
          sessionId: room.roomId,
          participantSeed: agent.config.name,
          role: "assistant",
          content: response,
        });
      }

      return response;
    });

    // Wire orchestrator handler
    room.onNeedOrchestratorResponse(async (sceneConfig, sceneState, recentMessages) => {
      const response = await this.runtime.getOrchestratorResponse(
        sceneConfig,
        sceneState,
        recentMessages,
      );

      if (this.logger) {
        await this.logger.event("cortex.orchestrator.escalation", {
          sessionId: room.roomId,
          urgency: sceneState.urgency,
          mode: sceneState.currentMode,
        });
      }

      return response;
    });

    // Wire completion handler
    room.onComplete(async (completedRoom) => {
      if (this.logger) {
        await this.logger.event("cortex.room.completed", {
          sessionId: completedRoom.roomId,
          messageCount: completedRoom.getMessages().length,
          agentCount: completedRoom.getAgents().size,
        });
      }
    });

    this.rooms.set(room.roomId, room);

    if (this.logger) {
      await this.logger.event("cortex.room.created", {
        sessionId: room.roomId,
        title: input.title,
        agentCount: scene.agents.length,
        mode: scene.sceneConfig.mode,
        composer: scene.compositionMeta.composer,
        compositionDurationMs: scene.compositionMeta.durationMs,
      });
    }

    return room.roomId;
  }

  startRoom(roomId: string): void {
    const room = this.getRoom(roomId);
    room.start();
    this.startTimes.set(roomId, Date.now());

    this.logger?.event("cortex.room.started", { sessionId: roomId }).catch(() => {});
  }

  stopRoom(roomId: string): void {
    const room = this.getRoom(roomId);
    room.stop();

    this.logger?.event("cortex.room.stopped", { sessionId: roomId }).catch(() => {});
  }

  destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      if (room.status === "running") {
        room.stop();
      }
      this.rooms.delete(roomId);
      this.startTimes.delete(roomId);
    }
  }

  injectMessage(roomId: string, content: string, from = "external"): void {
    const room = this.getRoom(roomId);
    room.injectMessage(content, from);

    if (this.logger) {
      this.logger
        .conversation({
          sessionId: roomId,
          participantSeed: from,
          role: "user",
          content,
        })
        .catch(() => {});
    }
  }

  listRooms(): RoomSummary[] {
    return Array.from(this.rooms.entries()).map(([, room]) => ({
      roomId: room.roomId,
      name: room.config.name,
      status: room.status,
      agentCount: room.getAgents().size,
      messageCount: room.getMessages().length,
      startedAt: this.startTimes.get(room.roomId) ?? null,
    }));
  }

  getRoomDetail(roomId: string): RoomDetail {
    const room = this.getRoom(roomId);
    const sceneState = room.getSceneState();

    return {
      roomId: room.roomId,
      name: room.config.name,
      status: room.status,
      agentCount: room.getAgents().size,
      messageCount: room.getMessages().length,
      startedAt: this.startTimes.get(roomId) ?? null,
      agents: Array.from(room.getAgents().values()).map((agent) => ({
        name: agent.config.name,
        profileId: agent.config.profileId,
        fsm: agent.state.fsm,
        energy: agent.state.energy,
        initiative: agent.state.initiative,
      })),
      messages: room.getMessages(),
      sceneState: sceneState
        ? {
            urgency: sceneState.urgency,
            currentMode: sceneState.currentMode,
            pacing: sceneState.pacing,
          }
        : null,
    };
  }

  getMessages(roomId: string): RoomMessage[] {
    return this.getRoom(roomId).getMessages();
  }

  private getRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }
    return room;
  }

  async shutdown(): Promise<void> {
    for (const [, room] of this.rooms) {
      if (room.status === "running") {
        room.stop();
      }
    }
    if (this.logger) {
      await this.logger.flush();
      await this.logger.close();
    }
  }
}
