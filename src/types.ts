// FSM States — only RESPONDING triggers an API call
export type FSMState = "IDLE" | "LISTENING" | "RESPONDING" | "STATUS_SIGNAL" | "COOLDOWN";

// Relevance levels from the zero-cost evaluation
export type RelevanceLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

// Engine events — the pulse of the system
export type EngineEvent =
  | { type: "message"; from: string; content: string; timestamp: number }
  | { type: "tick"; tickNumber: number; timestamp: number }
  | { type: "scene"; content: string; timestamp: number }
  | { type: "status_signal"; from: string; content: string; timestamp: number }
  | { type: "system"; content: string; timestamp: number }
  | { type: "orchestrator_directive"; target: string; directive: string; timestamp: number };

// What the FSM decides to do
export interface FSMTransition {
  nextState: FSMState;
  action?: "respond" | "signal" | "initiate" | "timeout" | "none";
  signalCategory?: string;
}

// Tool access tiers — phone is fast/constrained, desktop is powerful/expensive
export type ToolTier = "none" | "phone" | "desktop";

// Per-tool constraints enforced by the runtime
export interface ToolConstraints {
  timeoutMs: number;
  maxResponseTokens?: number;
  maxResults?: number;
}

// Tool definition for agent tool-use loops
export interface ToolDefinition {
  name: string;
  description: string;
  tier: ToolTier;
  constraints: ToolConstraints;
  inputSchema: Record<string, unknown>;
}

// Agent configuration — resolved from pg agent_profiles or composed by University
export interface AgentConfig {
  name: string;
  profileId?: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  toolTier: ToolTier;
  thinkingTolerance: number; // max ticks in RESPONDING before watchdog fires
  triggers: {
    watchwords: string[];
    prioritySignals: string[];
    randomChance: number;
  };
  energy: {
    max: number;
    responseCost: number;
    statusCost: number;
    rechargeRate: number;
  };
  initiative: {
    threshold: number;
    increaseRate: number;
  };
  cooldownTicks: number;
  statusSignals: Record<string, string[]>;
}

// Mutable internal state per agent — evolves deterministically
export interface AgentState {
  fsm: FSMState;
  energy: number;
  initiative: number;
  mood: number; // -1 to 1
  cooldownRemaining: number;
  lastSpoke: number;
  attention: string[];
  thinkingTicks: number; // ticks spent in RESPONDING (watchdog counter)
  thinkingIntent?: string; // what the agent is doing: "researching", "analyzing", etc.
}

// Result of a completed tool-use loop, queued for next-tick processing
export interface PendingResponse {
  agentName: string;
  content: string;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  timedOut: boolean;
}

// An agent instance = config + state + conversation history
export interface Agent {
  config: AgentConfig;
  state: AgentState;
  history: HistoryEntry[];
}

// Display message for the room
export interface RoomMessage {
  id: string;
  type: "message" | "status_signal" | "scene" | "system";
  from: string;
  content: string;
  timestamp: number;
}

// Conversation history entry (for Anthropic API)
export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

// Event bus event map
export interface EventMap {
  event: [EngineEvent];
  stateChange: [string, AgentState];
  roomMessage: [RoomMessage];
}

// Room configuration
export interface RoomConfig {
  name: string;
  tickRate: number;
  maxMessages: number;
  sceneEvents: SceneEvent[];
}

// Weighted scene event for the orchestrator pacemaker
export interface SceneEvent {
  weight: number;
  content: string;
}

// Scene configuration
export interface SceneConfig {
  name: string;
  mode: "deliberate" | "urgent" | "creative" | "review";
  tickRate: number;
  maxMessages: number;
  orchestratorModel: string;
  orchestratorMaxTokens: number;
  orchestratorEscalationThreshold: number;
  urgencyKeywords: string[];
  modeMap: Record<string, string[]>;
  events: Record<string, SceneEvent[]>;
  orchestratorSystemPrompt: string;
  description: string;
}

// Mutable scene state — evolves deterministically
export interface SceneState {
  urgency: number; // 0-10
  currentMode: string;
  pacing: number;
  ticksSinceLastOrchestrator: number;
}

// Completion conditions for a room
export interface CompletionConditions {
  maxTicks?: number;
  maxMessages?: number;
  maxDurationMs?: number;
}

// Room lifecycle status
export type RoomStatus = "pending" | "running" | "completed" | "failed" | "stopped";

// Scene composition input
export interface ComposeInput {
  specId?: string;
  title: string;
  body: string;
  agents: string[];
  domains: string[];
  mode?: "deliberate" | "urgent" | "creative" | "review";
  maxTicks?: number;
  maxMessages?: number;
  maxDurationMs?: number;
  orchestratorModel?: string;
}

// Composed scene — what the scene composer produces
export interface ComposedScene {
  sceneConfig: SceneConfig;
  agents: AgentConfig[];
  completionConditions: CompletionConditions;
  compositionMeta: {
    composer: string;
    durationMs: number;
    agentsResolved: number;
  };
}
