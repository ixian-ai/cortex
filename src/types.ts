// FSM States — only RESPONDING triggers an API call
export type FSMState = 'IDLE' | 'LISTENING' | 'RESPONDING' | 'EMOTING' | 'COOLDOWN';

// Relevance levels from the zero-cost evaluation
export type RelevanceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

// Engine events — the pulse of the system
export type EngineEvent =
  | { type: 'message'; from: string; content: string; timestamp: number }
  | { type: 'tick'; tickNumber: number; timestamp: number }
  | { type: 'scene'; content: string; timestamp: number }
  | { type: 'emote'; from: string; content: string; timestamp: number }
  | { type: 'system'; content: string; timestamp: number }
  | { type: 'dm_directive'; target: string; directive: string; timestamp: number };

// What the FSM decides to do
export interface FSMTransition {
  nextState: FSMState;
  action?: 'respond' | 'emote' | 'initiate' | 'none';
  emoteCategory?: string; // which emote set to pick from
}

// Character definition — parsed from markdown frontmatter
export interface CharacterConfig {
  name: string;
  realm: string;
  type: string;
  model: string;
  maxTokens: number;
  triggers: {
    keywords: string[];
    alwaysRespondTo: string[];
    randomChance: number;
  };
  energy: {
    max: number;
    responseCost: number;
    emoteCost: number;
    rechargeRate: number;
  };
  boredom: {
    threshold: number;
    increaseRate: number;
  };
  cooldownTicks: number;
  emotes: Record<string, string[]>;
  systemPrompt: string;
}

// Mutable internal state per character — evolves deterministically
export interface CharacterState {
  fsm: FSMState;
  energy: number;
  boredom: number;
  mood: number; // -1 to 1
  cooldownRemaining: number;
  lastSpoke: number;
  attention: string[];
}

// A character instance = config + state + conversation history
export interface Character {
  config: CharacterConfig;
  state: CharacterState;
  history: HistoryEntry[];
}

// Display message for the TUI
export interface RoomMessage {
  id: string;
  type: 'message' | 'emote' | 'scene' | 'system';
  from: string;
  content: string;
  timestamp: number;
}

// Conversation history entry (for Anthropic API)
export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

// Event bus event map
export interface EventMap {
  event: [EngineEvent];
  stateChange: [string, CharacterState]; // characterName, newState
  roomMessage: [RoomMessage];
}

// Room configuration
export interface RoomConfig {
  name: string;
  tickRate: number; // ms between ticks
  maxMessages: number; // max messages in the log
  sceneEvents: SceneEvent[];
}

// Weighted scene event for the DM pacemaker
export interface SceneEvent {
  weight: number; // 0-1 probability per tick
  content: string;
}

// Scene configuration (parsed from .mdx frontmatter)
export interface SceneConfig {
  name: string;
  realm: string;
  tone: 'calm' | 'tense' | 'jovial' | 'somber';
  tickRate: number;
  maxMessages: number;
  dmModel: string;
  dmMaxTokens: number;
  dmEscalationThreshold: number;
  tensionKeywords: string[];
  toneMap: Record<string, string[]>;
  events: Record<string, SceneEvent[]>;
  dmSystemPrompt: string;  // markdown body
  description: string;     // first section of markdown body
}

// Mutable scene state — evolves deterministically
export interface SceneState {
  tension: number;        // 0-10
  currentTone: string;    // derived from conversation
  pacing: number;         // ticks since last scene event
  ticksSinceLastDM: number;
}
