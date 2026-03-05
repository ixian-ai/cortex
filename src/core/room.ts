import { generateId } from "@ixian/shared-types";
import { v4 as uuid } from "uuid";
import type {
  Agent,
  AgentConfig,
  AgentState,
  CompletionConditions,
  EngineEvent,
  RoomConfig,
  RoomMessage,
  RoomStatus,
  SceneConfig,
  SceneState,
} from "../types.js";
import { Clock } from "./clock.js";
import { EventBus } from "./event-bus.js";
import { evaluateFSM, tickState } from "./fsm.js";
import {
  createSceneState,
  rollSceneEvent,
  shouldEscalateToOrchestrator,
  tickSceneState,
} from "./scene-engine.js";

type ResponseHandler = (agent: Agent, context: RoomMessage[]) => Promise<string>;
type OrchestratorResponseHandler = (
  sceneConfig: SceneConfig,
  sceneState: SceneState,
  recentMessages: RoomMessage[],
) => Promise<string>;
type CompletionHandler = (room: Room) => void;

/**
 * The Room — central state manager and heart of the engine.
 * Owns the EventBus, Clock, agents, and message log.
 * Orchestrates tick processing, FSM evaluation, and async API responses.
 */
export class Room {
  readonly roomId: string;
  readonly config: RoomConfig;
  readonly eventBus: EventBus;
  readonly completionConditions: CompletionConditions;
  private clock: Clock;
  private agents: Map<string, Agent> = new Map();
  private messages: RoomMessage[] = [];
  private responseHandler: ResponseHandler | null = null;
  private orchestratorResponseHandler: OrchestratorResponseHandler | null = null;
  private completionHandler: CompletionHandler | null = null;
  private startedAt: number | null = null;
  private _status: RoomStatus = "pending";

  sceneConfig: SceneConfig | null = null;
  sceneState: SceneState | null = null;

  constructor(
    config: RoomConfig,
    sceneConfig?: SceneConfig | null,
    completionConditions?: CompletionConditions,
  ) {
    this.roomId = generateId();
    this.completionConditions = completionConditions ?? {};

    if (sceneConfig) {
      this.config = {
        ...config,
        tickRate: sceneConfig.tickRate,
        maxMessages: sceneConfig.maxMessages,
        name: sceneConfig.name,
      };
      this.sceneConfig = sceneConfig;
      this.sceneState = createSceneState(sceneConfig);
    } else {
      this.config = config;
    }

    this.eventBus = new EventBus();
    this.clock = new Clock(this.eventBus, this.config.tickRate);
  }

  get status(): RoomStatus {
    return this._status;
  }

  // ── Agent management ──────────────────────────────────────────────────

  addAgent(config: AgentConfig): void {
    const initialState: AgentState = {
      fsm: "IDLE",
      energy: config.energy.max,
      initiative: 0,
      mood: 0,
      cooldownRemaining: 0,
      lastSpoke: 0,
      attention: [],
    };

    this.agents.set(config.name, {
      config,
      state: initialState,
      history: [],
    });
  }

  // ── Message management ────────────────────────────────────────────────

  addMessage(msg: RoomMessage): void {
    this.messages.push(msg);
    this.eventBus.emit("roomMessage", msg);

    if (this.messages.length > this.config.maxMessages) {
      this.messages = this.messages.slice(-this.config.maxMessages);
    }

    if (this.sceneState && msg.type === "message") {
      this.sceneState = { ...this.sceneState, pacing: 0 };
    }
  }

  getAgents(): Map<string, Agent> {
    return this.agents;
  }

  getMessages(): RoomMessage[] {
    return this.messages;
  }

  getSceneState(): SceneState | null {
    return this.sceneState;
  }

  getSceneConfig(): SceneConfig | null {
    return this.sceneConfig;
  }

  // ── Event proxy ───────────────────────────────────────────────────────

  on(type: "event" | "stateChange" | "roomMessage", handler: (...args: unknown[]) => void): void {
    this.eventBus.on(type as "event", handler as (...args: [EngineEvent]) => void);
  }

  off(type: "event" | "stateChange" | "roomMessage", handler: (...args: unknown[]) => void): void {
    this.eventBus.off(type as "event", handler as (...args: [EngineEvent]) => void);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  start(): void {
    this._status = "running";
    this.startedAt = Date.now();
    this.eventBus.on("event", (event) => this.handleEvent(event));
    this.clock.start();
  }

  stop(): void {
    this._status = "stopped";
    this.clock.stop();
    this.eventBus.removeAllListeners();
  }

  /**
   * Manual tick for testing / scenario mode.
   * Bypasses the setInterval clock — caller controls timing.
   */
  async tick(tickNumber: number = 0): Promise<void> {
    return this.handleTick({
      type: "tick",
      tickNumber,
      timestamp: Date.now(),
    });
  }

  // ── External message injection ────────────────────────────────────────

  injectMessage(content: string, from = "external"): void {
    const msg: RoomMessage = {
      id: uuid(),
      type: "message",
      from,
      content,
      timestamp: Date.now(),
    };

    this.addMessage(msg);

    const event: EngineEvent = {
      type: "message",
      from,
      content,
      timestamp: Date.now(),
    };

    this.handleMessageEvent(event, from);
  }

  // ── Callback registration ─────────────────────────────────────────────

  onNeedResponse(handler: ResponseHandler): void {
    this.responseHandler = handler;
  }

  onNeedOrchestratorResponse(handler: OrchestratorResponseHandler): void {
    this.orchestratorResponseHandler = handler;
  }

  onComplete(handler: CompletionHandler): void {
    this.completionHandler = handler;
  }

  // ── Event handling ────────────────────────────────────────────────────

  private handleEvent(event: EngineEvent): void {
    if (event.type === "tick") {
      this.handleTick(event);
    }
  }

  private async handleTick(tickEvent: EngineEvent): Promise<void> {
    // 1. Update internal state for each agent
    for (const [, agent] of this.agents) {
      agent.state = tickState(agent.state, agent.config);
    }

    // 2. Tick the scene state if we have a scene config
    if (this.sceneConfig && this.sceneState) {
      this.sceneState = tickSceneState(this.sceneState, this.messages, this.sceneConfig);

      // 3. Roll for scene events
      const sceneContent = rollSceneEvent(this.sceneConfig, this.sceneState);

      if (sceneContent) {
        this.sceneState = { ...this.sceneState, pacing: 0 };

        const sceneMsg: RoomMessage = {
          id: uuid(),
          type: "scene",
          from: "Scene",
          content: sceneContent,
          timestamp: Date.now(),
        };
        this.addMessage(sceneMsg);

        const sceneEvent: EngineEvent = {
          type: "scene",
          content: sceneContent,
          timestamp: Date.now(),
        };

        for (const [, agent] of this.agents) {
          await this.evaluateAndAct(agent, sceneEvent);
        }
      }

      // 4. Check if the orchestrator should escalate
      if (
        shouldEscalateToOrchestrator(this.sceneState, this.sceneConfig) &&
        this.orchestratorResponseHandler
      ) {
        this.sceneState = { ...this.sceneState, ticksSinceLastOrchestrator: 0 };

        try {
          const orchestratorContent = await this.orchestratorResponseHandler(
            this.sceneConfig,
            this.sceneState,
            this.messages.slice(-10),
          );

          if (orchestratorContent) {
            const orchestratorMsg: RoomMessage = {
              id: uuid(),
              type: "scene",
              from: "Orchestrator",
              content: orchestratorContent,
              timestamp: Date.now(),
            };
            this.addMessage(orchestratorMsg);
          }
        } catch {
          // Orchestrator escalation failed — silent fallback
        }
      }
    } else {
      // Fallback: use sceneEvents from RoomConfig
      const sceneEvents = this.config.sceneEvents;
      if (sceneEvents.length > 0) {
        for (const event of sceneEvents) {
          if (Math.random() < event.weight) {
            const sceneMsg: RoomMessage = {
              id: uuid(),
              type: "scene",
              from: "Scene",
              content: event.content,
              timestamp: Date.now(),
            };
            this.addMessage(sceneMsg);

            const sceneEvent: EngineEvent = {
              type: "scene",
              content: event.content,
              timestamp: Date.now(),
            };

            for (const [, agent] of this.agents) {
              await this.evaluateAndAct(agent, sceneEvent);
            }
            break;
          }
        }
      }
    }

    // 5. Evaluate tick event against each agent
    for (const [, agent] of this.agents) {
      await this.evaluateAndAct(agent, tickEvent);
    }

    // 6. Check completion conditions
    this.checkCompletion(tickEvent);
  }

  private handleMessageEvent(event: EngineEvent, senderName: string): void {
    for (const [name, agent] of this.agents) {
      if (name === senderName) continue;
      this.evaluateAndAct(agent, event);
    }
  }

  // ── FSM evaluation and action dispatch ────────────────────────────────

  private async evaluateAndAct(agent: Agent, event: EngineEvent): Promise<void> {
    const transition = evaluateFSM(event, agent.state, agent.config);
    agent.state = { ...agent.state, fsm: transition.nextState };

    switch (transition.action) {
      case "signal":
        this.handleStatusSignal(agent, transition.signalCategory ?? "idle");
        break;

      case "respond":
      case "initiate":
        await this.handleResponse(agent);
        break;

      case "none":
      default:
        break;
    }

    this.eventBus.emit("stateChange", agent.config.name, { ...agent.state });
  }

  // ── Status signals ────────────────────────────────────────────────────

  private handleStatusSignal(agent: Agent, category: string): void {
    const signalList = agent.config.statusSignals[category] ??
      agent.config.statusSignals["idle"] ?? ["..."];
    const signal = signalList[Math.floor(Math.random() * signalList.length)];

    const msg: RoomMessage = {
      id: uuid(),
      type: "status_signal",
      from: agent.config.name,
      content: signal,
      timestamp: Date.now(),
    };

    this.addMessage(msg);

    agent.state = {
      ...agent.state,
      fsm: "IDLE",
      energy: Math.max(0, agent.state.energy - agent.config.energy.statusCost),
      lastSpoke: Date.now(),
    };
  }

  // ── Responding (async API bridge) ─────────────────────────────────────

  private async handleResponse(agent: Agent): Promise<void> {
    if (!this.responseHandler) {
      agent.state = { ...agent.state, fsm: "IDLE" };
      return;
    }

    agent.state = { ...agent.state, fsm: "RESPONDING" };
    this.eventBus.emit("stateChange", agent.config.name, { ...agent.state });

    try {
      const context = this.messages.slice(-20);
      const responseContent = await this.responseHandler(agent, context);

      const msg: RoomMessage = {
        id: uuid(),
        type: "message",
        from: agent.config.name,
        content: responseContent,
        timestamp: Date.now(),
      };

      this.addMessage(msg);

      agent.history.push({ role: "assistant", content: responseContent });

      agent.state = {
        ...agent.state,
        fsm: "COOLDOWN",
        energy: Math.max(0, agent.state.energy - agent.config.energy.responseCost),
        cooldownRemaining: agent.config.cooldownTicks,
        initiative: 0,
        lastSpoke: Date.now(),
      };
    } catch {
      agent.state = { ...agent.state, fsm: "IDLE" };
    }

    this.eventBus.emit("stateChange", agent.config.name, { ...agent.state });
  }

  // ── Completion checking ───────────────────────────────────────────────

  private checkCompletion(tickEvent: EngineEvent): void {
    if (this._status !== "running") return;

    const conditions = this.completionConditions;

    if (
      conditions.maxTicks &&
      tickEvent.type === "tick" &&
      tickEvent.tickNumber >= conditions.maxTicks
    ) {
      this.complete();
      return;
    }

    const messageCount = this.messages.filter((m) => m.type === "message").length;
    if (conditions.maxMessages && messageCount >= conditions.maxMessages) {
      this.complete();
      return;
    }

    if (conditions.maxDurationMs && this.startedAt) {
      if (Date.now() - this.startedAt >= conditions.maxDurationMs) {
        this.complete();
        return;
      }
    }
  }

  private complete(): void {
    this._status = "completed";
    this.clock.stop();
    this.eventBus.removeAllListeners();
    this.completionHandler?.(this);
  }
}
