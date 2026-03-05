import Anthropic from "@anthropic-ai/sdk";
import type { Agent, RoomMessage, SceneConfig, SceneState } from "../types.js";
import { buildInitiationPrompt, buildPrompt } from "./prompt-builder.js";

const MAX_HISTORY = 20;

/**
 * AgentRuntime — wraps the Anthropic SDK and manages per-agent
 * API calls with sliding-window conversation history.
 */
export class AgentRuntime {
  private client: Anthropic;

  constructor(client?: Anthropic) {
    this.client =
      client ??
      new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
  }

  async getResponse(
    agent: Agent,
    recentMessages: RoomMessage[],
    isInitiation: boolean,
  ): Promise<string> {
    const prompt = isInitiation
      ? buildInitiationPrompt(agent, recentMessages)
      : buildPrompt(agent, recentMessages);

    agent.history.push({ role: "user", content: prompt });

    try {
      const messages = agent.history.slice(-MAX_HISTORY);

      const response = await this.client.messages.create({
        model: agent.config.model,
        max_tokens: agent.config.maxTokens,
        system: agent.config.systemPrompt,
        messages,
      });

      const textBlock = response.content.find((block) => block.type === "text");
      const text = textBlock ? textBlock.text : "[no response]";

      agent.history.push({ role: "assistant", content: text });

      if (agent.history.length > MAX_HISTORY) {
        agent.history = agent.history.slice(-MAX_HISTORY);
      }

      return text;
    } catch (error) {
      agent.history.pop();

      console.error(`[cortex] API call failed for ${agent.config.name}:`, error);

      return "[processing interrupted]";
    }
  }

  async getOrchestratorResponse(
    sceneConfig: SceneConfig,
    sceneState: SceneState,
    recentMessages: RoomMessage[],
  ): Promise<string> {
    const conversationSummary = recentMessages
      .slice(-10)
      .map((msg) => {
        if (msg.type === "status_signal") return `*${msg.from} ${msg.content}*`;
        if (msg.type === "scene" || msg.type === "system") return `[${msg.type}] ${msg.content}`;
        return `[${msg.from}] ${msg.content}`;
      })
      .join("\n");

    const prompt = [
      "--- Scene State ---",
      `Urgency: ${sceneState.urgency.toFixed(1)}/10`,
      `Current mode: ${sceneState.currentMode}`,
      `Pacing: ${sceneState.pacing} ticks since last event`,
      "",
      "--- Recent Conversation ---",
      conversationSummary,
      "",
      "--- Instructions ---",
      "Generate a brief coordination directive that fits the current urgency and mode.",
      "Keep it to 1-2 sentences. Guide the agents toward productive outcomes.",
      "Adjust coordination intensity based on the urgency level.",
    ].join("\n");

    try {
      const response = await this.client.messages.create({
        model: sceneConfig.orchestratorModel,
        max_tokens: sceneConfig.orchestratorMaxTokens,
        system: sceneConfig.orchestratorSystemPrompt,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      return textBlock ? textBlock.text : "Proceeding with current approach.";
    } catch (error) {
      console.error("[cortex] Orchestrator escalation failed:", error);
      return "Continue with current focus.";
    }
  }
}
