import Anthropic from '@anthropic-ai/sdk';
import type { Character, RoomMessage, HistoryEntry, SceneConfig, SceneState } from '../types.js';
import { buildPrompt, buildInitiationPrompt } from './prompt-builder.js';

const MAX_HISTORY = 20; // 10 exchanges (user + assistant pairs)

/**
 * AgentRuntime — wraps the Anthropic SDK and manages per-character
 * API calls with sliding-window conversation history.
 */
export class AgentRuntime {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Get a response for a character given the current room context.
   *
   * @param character  - The character instance (config + state + history)
   * @param recentMessages - Recent room messages for context
   * @param isInitiation - Whether this is a boredom-driven initiation
   * @returns The character's response text
   */
  async getResponse(
    character: Character,
    recentMessages: RoomMessage[],
    isInitiation: boolean,
  ): Promise<string> {
    // 1. Build the prompt using the appropriate builder
    const prompt = isInitiation
      ? buildInitiationPrompt(character, recentMessages)
      : buildPrompt(character, recentMessages);

    // 2. Add the prompt to character history as a 'user' message
    character.history.push({ role: 'user', content: prompt });

    try {
      // 3. Call the Anthropic API with a sliding window of history
      const messages = character.history.slice(-MAX_HISTORY);

      const response = await this.client.messages.create({
        model: character.config.model,
        max_tokens: character.config.maxTokens,
        system: character.config.systemPrompt,
        messages,
      });

      // 4. Extract the text response
      const textBlock = response.content.find((block) => block.type === 'text');
      const text = textBlock ? textBlock.text : '*stares blankly*';

      // 5. Add the response to character history as 'assistant'
      character.history.push({ role: 'assistant', content: text });

      // 6. Trim history to the sliding window size
      if (character.history.length > MAX_HISTORY) {
        character.history = character.history.slice(-MAX_HISTORY);
      }

      // 7. Return the response text
      return text;
    } catch (error) {
      // Remove the dangling user message we just pushed so history
      // stays in valid user/assistant alternation
      character.history.pop();

      console.error(
        `[AgentRuntime] API call failed for ${character.config.name}:`,
        error,
      );

      return '*looks momentarily distracted*';
    }
  }

  /**
   * Get a DM narrative response for scene escalation.
   * Called when tension exceeds the escalation threshold.
   * Stateless per-call — no conversation history maintained.
   *
   * @param sceneConfig - The scene configuration with DM system prompt
   * @param sceneState  - Current scene state (tension, tone, pacing)
   * @param recentMessages - Last 10 room messages for context
   * @returns A narrative beat or atmospheric event string
   */
  async getDMResponse(
    sceneConfig: SceneConfig,
    sceneState: SceneState,
    recentMessages: RoomMessage[]
  ): Promise<string> {
    // Summarize recent conversation (last 10 messages, one line each)
    const conversationSummary = recentMessages
      .slice(-10)
      .map((msg) => {
        if (msg.type === 'emote') return `*${msg.from} ${msg.content}*`;
        if (msg.type === 'scene' || msg.type === 'system') return `[${msg.type}] ${msg.content}`;
        return `[${msg.from}] ${msg.content}`;
      })
      .join('\n');

    // Include current tension and tone in the prompt
    const prompt = [
      '--- Scene State ---',
      `Tension: ${sceneState.tension.toFixed(1)}/10`,
      `Current tone: ${sceneState.currentTone}`,
      `Pacing: ${sceneState.pacing} ticks since last scene event`,
      '',
      '--- Recent Conversation ---',
      conversationSummary,
      '',
      '--- Instructions ---',
      'Generate a brief atmospheric narrative beat or scene event that fits the current tension and tone.',
      'Keep it to 1-2 sentences. Do not speak as any character — describe what happens in the environment.',
      'Escalate the drama subtly based on the tension level.',
    ].join('\n');

    try {
      const response = await this.client.messages.create({
        model: sceneConfig.dmModel,
        max_tokens: sceneConfig.dmMaxTokens,
        system: sceneConfig.dmSystemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      return textBlock ? textBlock.text : 'A heavy silence settles over the room.';
    } catch (error) {
      console.error('[AgentRuntime] DM escalation call failed:', error);
      return 'The shadows in the corners seem to deepen for a moment, then the feeling passes.';
    }
  }
}
