/**
 * Scenario runner — headless, autonomous, fast-loop execution.
 *
 * Runs a scene and set of characters without a clock or player input.
 * Ticks fire at API response speed. Output is captured, then post-processed
 * by Haiku into a narrative story.
 *
 * Usage:
 *   bun run scenario                         # default: enterprise-crossover
 *   bun run scenario -- --scene rocinante
 *   bun run scenario -- --max-ticks 20 --max-messages 40
 *   bun run scenario -- --output ./my-story.md
 *   bun run scenario -- --quiet              # suppress real-time output
 */

import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Room } from './core/room.js';
import { AgentRuntime } from './agent/runtime.js';
import { ScenarioRunner } from './scenario/runner.js';
import { Narrator } from './scenario/narrator.js';
import type { RoomConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const worldDir = resolve(__dirname, '..', 'world');
const outputDir = resolve(__dirname, '..', 'scenarios');

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const hasFlag = (flag: string): boolean => args.includes(flag);

const sceneName = getArg('--scene', 'enterprise-crossover');
const maxTicks = parseInt(getArg('--max-ticks', '35'));
const maxMessages = parseInt(getArg('--max-messages', '70'));
const outputPath = getArg('--output', join(outputDir, `${sceneName}-${Date.now()}.md`));
const verbose = !hasFlag('--quiet');

// ── Character sets per scene ─────────────────────────────────────────────────

const ent = (name: string) => join(worldDir, 'characters', 'enterprise', `${name}.mdx`);
const roc = (name: string) => join(worldDir, 'characters', 'rocinante', `${name}.mdx`);
const mid = (name: string) => join(worldDir, 'characters', `${name}.mdx`);

const characterSets: Record<string, string[]> = {
  'enterprise-crossover': [
    ent('worf'), ent('picard'), ent('data'), ent('troi'),
    roc('amos'), roc('alex'),
  ],
  'enterprise-bridge': [
    ent('worf'), ent('picard'), ent('data'), ent('riker'), ent('troi'), ent('geordi'), ent('crusher'),
  ],
  'rocinante': [
    roc('amos'), roc('alex'), roc('holden'), roc('naomi'),
  ],
  'prancing-pony': [
    mid('gandalf'), mid('frodo'), mid('aragorn'),
  ],
};

const sceneFiles: Record<string, string> = {
  'enterprise-crossover': join(worldDir, 'scenes', 'enterprise-crossover.mdx'),
  'enterprise-bridge':    join(worldDir, 'scenes', 'enterprise-bridge.mdx'),
  'rocinante':            join(worldDir, 'scenes', 'rocinante.mdx'),
  'prancing-pony':        join(worldDir, 'scenes', 'prancing-pony.mdx'),
};

const characterFiles = characterSets[sceneName];
const sceneFile = sceneFiles[sceneName];

if (!characterFiles || !sceneFile) {
  console.error(`Unknown scene: "${sceneName}"`);
  console.error(`Available: ${Object.keys(characterSets).join(', ')}`);
  process.exit(1);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const roomConfig: RoomConfig = {
  name: sceneName,
  tickRate: 5000, // ignored in scenario mode (no clock)
  maxMessages: 500,
  sceneEvents: [],
};

const room = new Room(roomConfig);
room.loadScene(sceneFile);
room.loadCharacterFiles(characterFiles);

const agentRuntime = new AgentRuntime();

room.onNeedResponse(async (character, context) => {
  const isInitiation = character.state.boredom >= character.config.boredom.threshold;
  return agentRuntime.getResponse(character, context, isInitiation);
});

room.onNeedDMResponse(async (sceneConfig, sceneState, recentMessages) => {
  return agentRuntime.getDMResponse(sceneConfig, sceneState, recentMessages);
});

// ── Run ───────────────────────────────────────────────────────────────────────

const charNames = characterFiles.map((f) => f.split('/').pop()?.replace('.mdx', '')).join(', ');
console.log(`\nScenario: ${sceneName}`);
console.log(`Characters: ${charNames}`);
console.log(`Max ticks: ${maxTicks} | Max messages: ${maxMessages}`);
console.log('─'.repeat(60));

const runner = new ScenarioRunner(room);
const { messages, ticks } = await runner.run({ maxTicks, maxMessages, verbose });

console.log(`\n${'─'.repeat(60)}`);
console.log(`Scenario complete: ${messages.length} messages in ${ticks} ticks`);

if (messages.filter((m) => m.type === 'message').length === 0) {
  console.error('\nNo dialogue captured. Characters may not have activated.');
  console.error('Try increasing --max-ticks or check that ANTHROPIC_API_KEY is set.');
  process.exit(1);
}

// ── Narrate ───────────────────────────────────────────────────────────────────

const narrator = new Narrator();
await narrator.generateNarrative(messages, room.getSceneConfig(), outputPath);
