import type { Agent, RoomMessage } from "../types.js";

const MAX_RECENT_MESSAGES = 15;

function formatConversation(recentMessages: RoomMessage[]): string {
  const sliced = recentMessages.slice(-MAX_RECENT_MESSAGES);

  return sliced
    .map((msg) => {
      if (msg.type === "status_signal") {
        return `*${msg.from} ${msg.content}*`;
      }
      if (msg.type === "scene" || msg.type === "system") {
        return `[${msg.type}] ${msg.content}`;
      }
      return `[${msg.from}] ${msg.content}`;
    })
    .join("\n");
}

function formatState(agent: Agent): string {
  const { energy, initiative, mood } = agent.state;
  const maxEnergy = agent.config.energy.max;

  return (
    `Your current state: energy=${energy}/${maxEnergy}, ` +
    `initiative=${initiative}, mood=${mood} ` +
    `(range: -1 critical to 1 enthusiastic)`
  );
}

/**
 * Build the prompt for a regular response — the agent has been
 * addressed or triggered and needs to reply.
 */
export function buildPrompt(agent: Agent, recentMessages: RoomMessage[]): string {
  const conversation = formatConversation(recentMessages);
  const state = formatState(agent);

  return [
    "--- Recent conversation ---",
    conversation,
    "",
    "--- Your internal state ---",
    state,
    "",
    "--- Instructions ---",
    "Respond according to your role. Keep your response concise (1-3 sentences unless the topic demands more). Do not include your name prefix.",
  ].join("\n");
}

/**
 * Build the prompt for when an agent self-activates due to high initiative.
 */
export function buildInitiationPrompt(agent: Agent, recentMessages: RoomMessage[]): string {
  const conversation = formatConversation(recentMessages);
  const state = formatState(agent);

  return [
    "--- Recent conversation ---",
    conversation,
    "",
    "--- Your internal state ---",
    state,
    "",
    "--- Instructions ---",
    "You have capacity for additional contribution. Start a discussion, raise a concern, or offer an observation relevant to the current context.",
    "Respond according to your role. Keep your response concise (1-3 sentences unless the topic demands more). Do not include your name prefix.",
  ].join("\n");
}
