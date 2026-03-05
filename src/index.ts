// Core engine

// Agent layer
export { buildInitiationPrompt, buildPrompt } from "./agent/prompt-builder.js";
export { AgentRuntime } from "./agent/runtime.js";
export { Clock } from "./core/clock.js";
export { EventBus } from "./core/event-bus.js";
export { evaluateFSM, tickState } from "./core/fsm.js";
export { evaluateRelevance } from "./core/relevance.js";
export { Room } from "./core/room.js";
export {
  analyzeConversation,
  createSceneState,
  rollSceneEvent,
  shouldEscalateToOrchestrator,
  tickSceneState,
} from "./core/scene-engine.js";
export type { RoomDetail, RoomSummary } from "./room-manager.js";
// Room management
export { RoomManager } from "./room-manager.js";

// Scene composition
export { BuiltinComposer, profileToAgentConfig } from "./scene/composer.js";
export type { SceneComposer } from "./scene/contract.js";

// Types
export type {
  Agent,
  AgentConfig,
  AgentState,
  CompletionConditions,
  ComposedScene,
  ComposeInput,
  EngineEvent,
  EventMap,
  FSMState,
  FSMTransition,
  HistoryEntry,
  RelevanceLevel,
  RoomConfig,
  RoomMessage,
  RoomStatus,
  SceneConfig,
  SceneEvent,
  SceneState,
} from "./types.js";
