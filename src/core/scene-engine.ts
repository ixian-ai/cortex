import type { RoomMessage, SceneConfig, SceneState } from "../types.js";

/**
 * Analyze recent messages for urgency and mode keywords (zero-cost).
 */
export function analyzeConversation(
  messages: RoomMessage[],
  config: SceneConfig,
): { urgencyDelta: number; detectedMode: string | null } {
  const recent = messages.slice(-5);
  const text = recent
    .map((m) => m.content)
    .join(" ")
    .toLowerCase();

  let urgencyHits = 0;
  for (const keyword of config.urgencyKeywords) {
    if (text.includes(keyword.toLowerCase())) urgencyHits++;
  }

  let detectedMode: string | null = null;
  let maxHits = 0;
  for (const [mode, keywords] of Object.entries(config.modeMap)) {
    let hits = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) hits++;
    }
    if (hits > maxHits) {
      maxHits = hits;
      detectedMode = mode;
    }
  }

  return { urgencyDelta: urgencyHits, detectedMode: maxHits > 0 ? detectedMode : null };
}

/**
 * Tick the scene state forward (deterministic, zero-cost).
 */
export function tickSceneState(
  state: SceneState,
  messages: RoomMessage[],
  config: SceneConfig,
): SceneState {
  const { urgencyDelta, detectedMode } = analyzeConversation(messages, config);

  const newUrgency = Math.max(0, Math.min(10, state.urgency + urgencyDelta * 0.5 - 0.1));
  const currentMode = detectedMode ?? (newUrgency > 6 ? "urgent" : config.mode);

  return {
    urgency: newUrgency,
    currentMode,
    pacing: state.pacing + 1,
    ticksSinceLastOrchestrator: state.ticksSinceLastOrchestrator + 1,
  };
}

/**
 * Roll for a scene event from the current mode's pool (zero-cost).
 */
export function rollSceneEvent(config: SceneConfig, state: SceneState): string | null {
  const pool = config.events[state.currentMode] ?? config.events[config.mode] ?? [];

  if (state.pacing < 3) return null;

  for (const event of pool) {
    if (Math.random() < event.weight) {
      return event.content;
    }
  }
  return null;
}

/**
 * Check if the orchestrator should make an AI call for a coordination beat.
 */
export function shouldEscalateToOrchestrator(state: SceneState, config: SceneConfig): boolean {
  return (
    state.urgency >= config.orchestratorEscalationThreshold &&
    state.ticksSinceLastOrchestrator >= 6 &&
    state.pacing >= 4
  );
}

/**
 * Create initial scene state.
 */
export function createSceneState(config: SceneConfig): SceneState {
  return {
    urgency: 0,
    currentMode: config.mode,
    pacing: 0,
    ticksSinceLastOrchestrator: 0,
  };
}
