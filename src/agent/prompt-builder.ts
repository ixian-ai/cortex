import type { Character, RoomMessage } from '../types.js';

const MAX_RECENT_MESSAGES = 15;

/**
 * Format recent room messages into a readable conversation log.
 * Each line is "[Name] message", limited to the last 15 messages.
 */
function formatConversation(recentMessages: RoomMessage[]): string {
  const sliced = recentMessages.slice(-MAX_RECENT_MESSAGES);

  return sliced
    .map((msg) => {
      if (msg.type === 'emote') {
        return `*${msg.from} ${msg.content}*`;
      }
      if (msg.type === 'scene' || msg.type === 'system') {
        return `[${msg.type}] ${msg.content}`;
      }
      return `[${msg.from}] ${msg.content}`;
    })
    .join('\n');
}

/**
 * Format a character's internal state into a readable summary.
 */
function formatState(character: Character): string {
  const { energy, boredom, mood } = character.state;
  const maxEnergy = character.config.energy.max;

  return (
    `Your current state: energy=${energy}/${maxEnergy}, ` +
    `boredom=${boredom}, mood=${mood} ` +
    `(range: -1 irritable to 1 cheerful)`
  );
}

/**
 * Build the full prompt for a regular response — the character has been
 * addressed or triggered and needs to reply.
 */
export function buildPrompt(
  character: Character,
  recentMessages: RoomMessage[],
): string {
  const conversation = formatConversation(recentMessages);
  const state = formatState(character);

  return [
    '--- Recent conversation ---',
    conversation,
    '',
    '--- Your internal state ---',
    state,
    '',
    '--- Instructions ---',
    'Respond in character. Keep your response concise (1-3 sentences unless the topic demands more). Do not include your name prefix — just speak.',
  ].join('\n');
}

/**
 * Build the prompt for when a character self-initiates due to boredom.
 * Includes an extra nudge to start a conversation or react to the scene.
 */
export function buildInitiationPrompt(
  character: Character,
  recentMessages: RoomMessage[],
): string {
  const conversation = formatConversation(recentMessages);
  const state = formatState(character);

  return [
    '--- Recent conversation ---',
    conversation,
    '',
    '--- Your internal state ---',
    state,
    '',
    '--- Instructions ---',
    "You're feeling restless. Start a conversation or make an observation about your surroundings. React to the current scene or engage someone.",
    'Respond in character. Keep your response concise (1-3 sentences unless the topic demands more). Do not include your name prefix — just speak.',
  ].join('\n');
}
