# CLAUDE.md

## Project Overview

FSM Agents — a game-engine-inspired multi-agent chat system. AI characters run on a finite state machine with deterministic state evolution. Only the RESPONDING state triggers API calls; everything else (keyword matching, energy/boredom updates, emotes, scene events) is zero-cost.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (ESM, react-jsx)
- **AI SDK**: `@anthropic-ai/sdk` (raw Anthropic API, not the Agent SDK)
- **TUI**: ink + React 18
- **World files**: `.mdx` (YAML frontmatter + markdown body, parsed with gray-matter)
- **Viewer**: Astro 5 with content collections

## Project Structure

- `src/core/` — engine internals (event bus, clock, FSM, relevance matcher, room, scene engine)
- `src/agent/` — Anthropic API wrapper and prompt builder
- `src/tui/` — ink/React terminal UI components
- `world/characters/` — character `.mdx` files (config + system prompt)
- `world/scenes/` — scene `.mdx` files (config + DM instructions)
- `viewer/` — Astro site for browsing world resources
- `characters/` — legacy character `.md` files (kept for reference)

## Key Commands

```bash
bun install                    # install dependencies
bun run start                  # run the engine + TUI
bun run dev                    # run with hot reload
cd viewer && bun run build     # build the Astro viewer
```

## Architecture Notes

- **FSM states**: IDLE → LISTENING → RESPONDING → EMOTING → COOLDOWN
- **Only RESPONDING triggers API calls** — this is the core cost optimization
- **Energy system**: characters have energy that depletes on responses (responseCost) and recharges per tick (rechargeRate)
- **Boredom**: increases each tick, triggers character-initiated conversation when threshold exceeded
- **Scene engine**: tracks tension (0-10) and tone (calm/tense/jovial/somber) from conversation keyword analysis
- **DM escalation**: single cheap API call when tension exceeds threshold + pacing/cooldown conditions met
- **Conversation history**: sliding window of 20 entries per character, no token counting

## World File Format

Characters and scenes use `.mdx` files. YAML frontmatter contains config (stats, triggers, events). Markdown body is the system prompt (characters) or DM instructions (scenes). These files are shared between the runtime engine and the Astro viewer — single source of truth.

## Adding Characters

Create a new `.mdx` file in `world/characters/`. Required frontmatter fields: `name`, `model`, `maxTokens`, `triggers`, `energy`, `boredom`, `cooldownTicks`, `emotes`. Optional: `realm`, `type`. The markdown body becomes the character's system prompt.

## Adding Scenes

Create a new `.mdx` file in `world/scenes/`. Required frontmatter: `name`, `tone`, `tensionKeywords`, `toneMap`, `events`. Optional: `realm`, `tickRate`, `maxMessages`, `dmModel`, `dmMaxTokens`, `dmEscalationThreshold`. The markdown body becomes the DM system prompt.

## Conventions

- Use `bun` as the runtime (not node/npm)
- Keep world files as `.mdx` for dual engine/viewer consumption
- Energy costs and boredom thresholds are the primary tuning knobs for character behavior
- Scene event weights should be low (0.05-0.15) — they roll every tick
- Tension keywords should be specific to the scene's genre/setting
