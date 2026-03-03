import type { SceneConfig, SceneState, SceneEvent, RoomMessage } from '../types.js';

// Analyze recent messages for tension and tone keywords (zero-cost)
export function analyzeConversation(
  messages: RoomMessage[],
  config: SceneConfig
): { tensionDelta: number; detectedTone: string | null } {
  const recent = messages.slice(-5); // only look at last 5 messages
  const text = recent.map(m => m.content).join(' ').toLowerCase();

  // Count tension keyword hits
  let tensionHits = 0;
  for (const keyword of config.tensionKeywords) {
    if (text.includes(keyword.toLowerCase())) tensionHits++;
  }

  // Detect dominant tone from toneMap
  let detectedTone: string | null = null;
  let maxHits = 0;
  for (const [tone, keywords] of Object.entries(config.toneMap)) {
    let hits = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) hits++;
    }
    if (hits > maxHits) {
      maxHits = hits;
      detectedTone = tone;
    }
  }

  return { tensionDelta: tensionHits, detectedTone: maxHits > 0 ? detectedTone : null };
}

// Tick the scene state forward (deterministic, zero-cost)
export function tickSceneState(
  state: SceneState,
  messages: RoomMessage[],
  config: SceneConfig
): SceneState {
  const { tensionDelta, detectedTone } = analyzeConversation(messages, config);

  // Tension rises from keywords, decays naturally
  const newTension = Math.max(0, Math.min(10,
    state.tension + tensionDelta * 0.5 - 0.1 // slow decay
  ));

  // Tone shifts toward detected tone, or defaults to scene config tone
  const currentTone = detectedTone ?? (newTension > 6 ? 'tense' : config.tone);

  return {
    tension: newTension,
    currentTone,
    pacing: state.pacing + 1,
    ticksSinceLastDM: state.ticksSinceLastDM + 1,
  };
}

// Roll for a scene event from the current tone's pool (zero-cost)
export function rollSceneEvent(config: SceneConfig, state: SceneState): string | null {
  const pool = config.events[state.currentTone] ?? config.events[config.tone] ?? [];

  // Suppress events during active conversation (low pacing)
  if (state.pacing < 3) return null;

  for (const event of pool) {
    if (Math.random() < event.weight) {
      return event.content;
    }
  }
  return null;
}

// Check if the DM should make an AI call for a narrative beat
export function shouldEscalateToDM(state: SceneState, config: SceneConfig): boolean {
  return (
    state.tension >= config.dmEscalationThreshold &&
    state.ticksSinceLastDM >= 6 && // at least 30 seconds since last DM call
    state.pacing >= 4 // not during rapid conversation
  );
}

// Create initial scene state
export function createSceneState(config: SceneConfig): SceneState {
  return {
    tension: 0,
    currentTone: config.tone,
    pacing: 0,
    ticksSinceLastDM: 0,
  };
}
