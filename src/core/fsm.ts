import type { FSMState, FSMTransition, EngineEvent, CharacterConfig, CharacterState } from '../types.js';
import { evaluateRelevance } from './relevance.js';

/**
 * Pure deterministic FSM evaluation.
 * Given an event, the current character state, and config, returns the
 * next state transition with an optional action.
 */
export function evaluateFSM(
  event: EngineEvent,
  state: CharacterState,
  config: CharacterConfig
): FSMTransition {
  const hasEnergy = state.energy >= config.energy.responseCost;

  switch (state.fsm) {
    // ── IDLE ──────────────────────────────────────────────────────────
    case 'IDLE':
      return evaluateIdle(event, state, config, hasEnergy);

    // ── RESPONDING ───────────────────────────────────────────────────
    // The room handles transitioning to COOLDOWN after the API response.
    case 'RESPONDING':
      return { nextState: 'RESPONDING' };

    // ── EMOTING ──────────────────────────────────────────────────────
    // The room handles transitioning back to IDLE after the emote is sent.
    case 'EMOTING':
      return { nextState: 'EMOTING' };

    // ── COOLDOWN ─────────────────────────────────────────────────────
    case 'COOLDOWN':
      return evaluateCooldown(event, state);

    default:
      return { nextState: state.fsm };
  }
}

// ── IDLE sub-evaluation ────────────────────────────────────────────────

function evaluateIdle(
  event: EngineEvent,
  state: CharacterState,
  config: CharacterConfig,
  hasEnergy: boolean
): FSMTransition {
  switch (event.type) {
    case 'message': {
      const relevance = evaluateRelevance(event.content, event.from, config);

      switch (relevance) {
        case 'HIGH':
        case 'MEDIUM':
          if (hasEnergy) {
            return { nextState: 'RESPONDING', action: 'respond' };
          }
          // No energy — fall back to a contextual emote
          return { nextState: 'EMOTING', action: 'emote', emoteCategory: 'contextual' };

        case 'LOW':
          return { nextState: 'EMOTING', action: 'emote', emoteCategory: 'idle' };

        case 'NONE':
        default:
          return { nextState: 'IDLE' };
      }
    }

    case 'tick': {
      // Boredom-driven initiation
      if (state.boredom >= config.boredom.threshold && hasEnergy) {
        return { nextState: 'RESPONDING', action: 'initiate' };
      }

      // Random idle emote (5% chance per tick)
      if (Math.random() < 0.05) {
        return { nextState: 'EMOTING', action: 'emote', emoteCategory: 'idle' };
      }

      return { nextState: 'IDLE' };
    }

    // Scene events are NMIs — bypass energy checks
    case 'scene':
      return { nextState: 'RESPONDING', action: 'respond' };

    // DM directives targeting this character are NMIs
    case 'dm_directive':
      if (event.target.toLowerCase() === config.name.toLowerCase()) {
        return { nextState: 'RESPONDING', action: 'respond' };
      }
      return { nextState: 'IDLE' };

    default:
      return { nextState: 'IDLE' };
  }
}

// ── COOLDOWN sub-evaluation ────────────────────────────────────────────

function evaluateCooldown(
  event: EngineEvent,
  state: CharacterState
): FSMTransition {
  if (event.type === 'tick') {
    const remaining = state.cooldownRemaining - 1;
    if (remaining <= 0) {
      return { nextState: 'IDLE' };
    }
    return { nextState: 'COOLDOWN' };
  }

  // Non-tick events don't affect cooldown
  return { nextState: 'COOLDOWN' };
}

// ── Tick state updater ─────────────────────────────────────────────────

/**
 * Called every tick to update internal character state.
 * Returns a new state object (immutable update).
 */
export function tickState(
  state: CharacterState,
  config: CharacterConfig
): CharacterState {
  return {
    ...state,
    energy: Math.min(config.energy.max, state.energy + config.energy.rechargeRate),
    boredom: state.boredom + config.boredom.increaseRate,
    cooldownRemaining: Math.max(0, state.cooldownRemaining - 1),
    mood: decayTowardZero(state.mood, 0.01),
  };
}

/** Decay a value toward zero by a fixed step. */
function decayTowardZero(value: number, step: number): number {
  if (value > 0) return Math.max(0, value - step);
  if (value < 0) return Math.min(0, value + step);
  return 0;
}
