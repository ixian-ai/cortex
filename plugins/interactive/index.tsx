import React from 'react';
import { render } from 'ink';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Room } from './core/room.js';
import { AgentRuntime } from './agent/runtime.js';
import { App } from './tui/App.js';
import type { RoomConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────────────────

const sceneFile = resolve(__dirname, '..', 'world', 'scenes', 'prancing-pony.mdx');
const charactersDir = resolve(__dirname, '..', 'world', 'characters');

// Base room config — scene config will override tickRate, maxMessages, and name
const roomConfig: RoomConfig = {
  name: 'The Prancing Pony',
  tickRate: 5000,
  maxMessages: 200,
  sceneEvents: [],
};

// ── Bootstrap ─────────────────────────────────────────────────────────────

// Create the room
const room = new Room(roomConfig);

// Load scene from .mdx (overrides room config values)
const sceneConfig = room.loadScene(sceneFile);

// Load characters from world/characters/ (.md and .mdx supported)
room.loadCharacters(charactersDir);

// Create the agent runtime and wire it to the room
const agentRuntime = new AgentRuntime();

room.onNeedResponse(async (character, context) => {
  const isInitiation = character.state.boredom >= character.config.boredom.threshold;
  return agentRuntime.getResponse(character, context, isInitiation);
});

// Wire up the DM response handler for scene escalation
room.onNeedDMResponse(async (sceneConfig, sceneState, recentMessages) => {
  return agentRuntime.getDMResponse(sceneConfig, sceneState, recentMessages);
});

// Add a welcome message
room.addMessage({
  id: 'welcome',
  type: 'system',
  from: 'System',
  content: `Welcome to ${room.config.name}. ${room.getCharacters().size} characters are present. Type a message to begin.`,
  timestamp: Date.now(),
});

// ── Render TUI ────────────────────────────────────────────────────────────

const app = render(<App room={room} />);

// Handle clean shutdown
process.on('SIGINT', () => {
  room.stop();
  app.unmount();
  process.exit(0);
});

await app.waitUntilExit();
