import type { AgentConfig, AgentState, EngineEvent, FSMTransition } from "../types.js";
import { evaluateRelevance } from "./relevance.js";

/**
 * Pure deterministic FSM evaluation.
 * Given an event, the current agent state, and config, returns the
 * next state transition with an optional action.
 */
export function evaluateFSM(
  event: EngineEvent,
  state: AgentState,
  config: AgentConfig,
): FSMTransition {
  const hasEnergy = state.energy >= config.energy.responseCost;

  switch (state.fsm) {
    case "IDLE":
      return evaluateIdle(event, state, config, hasEnergy);

    case "RESPONDING":
      return { nextState: "RESPONDING" };

    case "STATUS_SIGNAL":
      return { nextState: "STATUS_SIGNAL" };

    case "COOLDOWN":
      return evaluateCooldown(event, state);

    default:
      return { nextState: state.fsm };
  }
}

function evaluateIdle(
  event: EngineEvent,
  state: AgentState,
  config: AgentConfig,
  hasEnergy: boolean,
): FSMTransition {
  switch (event.type) {
    case "message": {
      const relevance = evaluateRelevance(event.content, event.from, config);

      switch (relevance) {
        case "HIGH":
        case "MEDIUM":
          if (hasEnergy) {
            return { nextState: "RESPONDING", action: "respond" };
          }
          return { nextState: "STATUS_SIGNAL", action: "signal", signalCategory: "contextual" };

        case "LOW":
          return { nextState: "STATUS_SIGNAL", action: "signal", signalCategory: "idle" };

        case "NONE":
        default:
          return { nextState: "IDLE" };
      }
    }

    case "tick": {
      // Initiative-driven self-activation
      if (state.initiative >= config.initiative.threshold && hasEnergy) {
        return { nextState: "RESPONDING", action: "initiate" };
      }

      // Random idle status signal (5% chance per tick)
      if (Math.random() < 0.05) {
        return { nextState: "STATUS_SIGNAL", action: "signal", signalCategory: "idle" };
      }

      return { nextState: "IDLE" };
    }

    // Scene events are NMIs — bypass energy checks
    case "scene":
      return { nextState: "RESPONDING", action: "respond" };

    // Orchestrator directives targeting this agent are NMIs
    case "orchestrator_directive":
      if (event.target.toLowerCase() === config.name.toLowerCase()) {
        return { nextState: "RESPONDING", action: "respond" };
      }
      return { nextState: "IDLE" };

    default:
      return { nextState: "IDLE" };
  }
}

function evaluateCooldown(event: EngineEvent, state: AgentState): FSMTransition {
  if (event.type === "tick") {
    const remaining = state.cooldownRemaining - 1;
    if (remaining <= 0) {
      return { nextState: "IDLE" };
    }
    return { nextState: "COOLDOWN" };
  }

  return { nextState: "COOLDOWN" };
}

/**
 * Called every tick to update internal agent state.
 * Returns a new state object (immutable update).
 */
export function tickState(state: AgentState, config: AgentConfig): AgentState {
  return {
    ...state,
    energy: Math.min(config.energy.max, state.energy + config.energy.rechargeRate),
    initiative: state.initiative + config.initiative.increaseRate,
    cooldownRemaining: Math.max(0, state.cooldownRemaining - 1),
    mood: decayTowardZero(state.mood, 0.01),
  };
}

function decayTowardZero(value: number, step: number): number {
  if (value > 0) return Math.max(0, value - step);
  if (value < 0) return Math.min(0, value + step);
  return 0;
}
