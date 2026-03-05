import type { AgentProfileRow, ResolverConfig } from "@ixian/signal-resolver";
import { resolve } from "@ixian/signal-resolver";
import type { AgentConfig, ComposedScene, ComposeInput, SceneConfig } from "../types.js";
import type { SceneComposer } from "./contract.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_ORCHESTRATOR_MODEL = "claude-sonnet-4-6";

/**
 * Map an AgentProfileRow from pg to an AgentConfig for the engine.
 */
export function profileToAgentConfig(profile: AgentProfileRow): AgentConfig {
  const meta = profile.meta as Record<string, unknown>;

  return {
    name: profile.display_name,
    profileId: profile.id,
    model: (meta.model as string) ?? DEFAULT_MODEL,
    maxTokens: (meta.maxTokens as number) ?? 300,
    systemPrompt: profile.body,
    triggers: {
      watchwords: profile.tags,
      prioritySignals: [`@${profile.seed}`, "@everyone"],
      randomChance: (meta.randomChance as number) ?? 0.05,
    },
    energy: {
      max: ((meta.energy as Record<string, unknown>)?.max as number) ?? 10,
      responseCost: ((meta.energy as Record<string, unknown>)?.responseCost as number) ?? 3,
      statusCost: ((meta.energy as Record<string, unknown>)?.statusCost as number) ?? 1,
      rechargeRate: ((meta.energy as Record<string, unknown>)?.rechargeRate as number) ?? 1,
    },
    initiative: {
      threshold: ((meta.initiative as Record<string, unknown>)?.threshold as number) ?? 5,
      increaseRate: ((meta.initiative as Record<string, unknown>)?.increaseRate as number) ?? 0.5,
    },
    cooldownTicks: (meta.cooldownTicks as number) ?? 2,
    statusSignals: {
      idle: ["[analyzing...]", "[reviewing context]"],
      contextual: ["[processing...]", "[considering approach]"],
    },
  };
}

/**
 * Build a default orchestrator system prompt from the compose input.
 */
function buildOrchestratorPrompt(input: ComposeInput, agentNames: string[]): string {
  return [
    `You are the orchestrator for a coordination session: "${input.title}"`,
    "",
    "Context:",
    input.body,
    "",
    `Agents in this session: ${agentNames.join(", ")}`,
    `Domains: ${input.domains.join(", ") || "general"}`,
    "",
    "Your role is to guide agents toward productive outcomes.",
    "Issue coordination directives when urgency is high or agents need redirection.",
    "Keep directives brief and actionable.",
  ].join("\n");
}

/**
 * BuiltinComposer — MVP scene composer that resolves agents
 * directly from pg via signal-resolver.
 */
export class BuiltinComposer implements SceneComposer {
  readonly name = "builtin";
  private resolverConfig: ResolverConfig;

  constructor(resolverConfig: ResolverConfig) {
    this.resolverConfig = resolverConfig;
  }

  async compose(input: ComposeInput): Promise<ComposedScene> {
    const startTime = Date.now();
    const agents: AgentConfig[] = [];
    const errors: string[] = [];

    // Resolve each @role seed
    for (const seed of input.agents) {
      const result = await resolve(seed, input.title, this.resolverConfig);

      if (result.kind === "hit") {
        agents.push(profileToAgentConfig(result.profile));
      } else {
        errors.push(`Failed to resolve agent seed "${seed}": ${result.reason}`);
      }
    }

    if (agents.length === 0) {
      throw new Error(`No agents resolved. Errors: ${errors.join("; ")}`);
    }

    const mode = input.mode ?? "deliberate";
    const agentNames = agents.map((a) => a.name);

    const sceneConfig: SceneConfig = {
      name: input.title,
      mode,
      tickRate: 5000,
      maxMessages: input.maxMessages ?? 200,
      orchestratorModel: input.orchestratorModel ?? DEFAULT_ORCHESTRATOR_MODEL,
      orchestratorMaxTokens: 300,
      orchestratorEscalationThreshold: 7,
      urgencyKeywords: mode === "urgent" ? ["critical", "blocked", "emergency", "asap"] : [],
      modeMap: {
        urgent: ["critical", "blocked", "emergency", "immediately"],
        creative: ["brainstorm", "idea", "explore", "alternative"],
        review: ["check", "verify", "confirm", "validate"],
      },
      events: {},
      orchestratorSystemPrompt: buildOrchestratorPrompt(input, agentNames),
      description: input.body,
    };

    return {
      sceneConfig,
      agents,
      completionConditions: {
        maxTicks: input.maxTicks ?? 100,
        maxMessages: input.maxMessages ?? 200,
        maxDurationMs: input.maxDurationMs ?? 600_000,
      },
      compositionMeta: {
        composer: this.name,
        durationMs: Date.now() - startTime,
        agentsResolved: agents.length,
      },
    };
  }
}
