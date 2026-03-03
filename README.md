# FSM Agents

A game-engine-inspired multi-agent chat system where AI characters live in a room and interact with each other — and you. The core innovation: a **finite state machine** makes 90%+ of runtime cost zero API calls. Characters have internal state (energy, boredom, mood) that evolves deterministically each tick. Only when the FSM transitions to `RESPONDING` does an expensive AI call fire.

## The Problem

Multi-agent systems are expensive. If every message triggers every agent, costs explode. Most "multi-agent" frameworks treat each agent as a stateless API call — the only way a character "decides" what to do is by asking an LLM.

## The Solution

Borrow from game engines. Characters run on a **tick clock** (default 5s). Each tick:

1. **Deterministic state update** — energy recharges, boredom increases, cooldowns decrement (free)
2. **FSM evaluation** — keyword matching, @mention detection, boredom thresholds (free)
3. **Action dispatch** — only `RESPONDING` triggers an API call; `EMOTING` uses canned templates (free)

```
IDLE ──message──▶ LISTENING ──relevant──▶ RESPONDING ──done──▶ COOLDOWN ──expired──▶ IDLE
  │                    │
  │──bored──▶ RESPONDING (initiate)      │──low energy──▶ EMOTING ──done──▶ IDLE
  │──random──▶ EMOTING                   │──not relevant──▶ IDLE
```

A character with 100 energy and 30 response cost gets ~3 responses before needing to recharge. At 2 energy/tick and 5s ticks, that's ~75s to full recharge. The engine self-regulates.

## Architecture

```
fsm-agents/
├── world/                    # Data-driven world definition (.mdx)
│   ├── characters/           # Character configs + system prompts
│   │   ├── gandalf.mdx
│   │   ├── frodo.mdx
│   │   └── aragorn.mdx
│   └── scenes/               # Scene configs + DM instructions
│       └── prancing-pony.mdx
├── src/
│   ├── index.tsx              # Entry point
│   ├── types.ts               # All shared types
│   ├── core/
│   │   ├── event-bus.ts       # Typed EventEmitter
│   │   ├── clock.ts           # Tick interval driver
│   │   ├── fsm.ts             # FSM states + transitions
│   │   ├── relevance.ts       # Zero-cost keyword/@mention matching
│   │   ├── room.ts            # Central state manager
│   │   └── scene-engine.ts    # Reactive scene FSM (tension/tone)
│   ├── agent/
│   │   ├── runtime.ts         # Anthropic SDK wrapper
│   │   └── prompt-builder.ts  # System prompt + state injection
│   └── tui/
│       ├── App.tsx            # Root layout (ink/React)
│       ├── ChatPane.tsx       # Scrollable message log
│       ├── StatusSidebar.tsx  # Per-character state bars
│       └── InputBar.tsx       # Text input
└── viewer/                    # Astro site — browse world resources
```

## World Files

Characters and scenes are `.mdx` files — YAML frontmatter for config, markdown body for system prompts. The same files feed both the runtime engine (via `gray-matter`) and the Astro documentation viewer (via content collections). Single source of truth.

### Character Example

```yaml
---
name: Gandalf
model: claude-sonnet-4-6
maxTokens: 300
triggers:
  keywords: [magic, wizard, ring, danger]
  alwaysRespondTo: ["@gandalf", "@everyone"]
  randomChance: 0.1
energy:
  max: 100
  responseCost: 30
  emoteCost: 5
  rechargeRate: 2
boredom:
  threshold: 50
  increaseRate: 3
emotes:
  idle: ["*puffs pipe thoughtfully*", "*gazes into the fire*"]
---

You are Gandalf the Grey...
```

### Scene Example

Scenes define tone-keyed event pools, tension keywords, and DM escalation rules:

```yaml
---
name: The Prancing Pony
tone: calm
tensionKeywords: [sword, fight, danger, nazgul]
toneMap:
  calm: [ale, fire, warm, song]
  tense: [shadow, whisper, blade, watch]
events:
  calm:
    - weight: 0.08
      content: "The fire crackles and pops..."
  tense:
    - weight: 0.12
      content: "A cold draft sweeps through..."
dmEscalationThreshold: 8
---

DM instructions here...
```

The scene engine tracks **tension** (rises from keyword hits, decays naturally) and **tone** (derived from conversation analysis). Scene events are drawn from the current tone's pool. When tension exceeds the threshold, the engine makes a single cheap AI call for a narrative DM beat.

## Running

### Prerequisites

- [Bun](https://bun.sh) runtime
- An Anthropic API key

### Setup

```bash
bun install
export ANTHROPIC_API_KEY=sk-ant-...
```

### Start

```bash
bun run start
# or with hot reload:
bun run dev
```

### Viewer (Astro)

```bash
cd viewer
bun install
bun run dev     # dev server at localhost:4321
bun run build   # static site in dist/
```

## TUI Layout

```
+--[Chat 75%]------------------------------+--[Status 25%]--------+
| [SCENE] The tavern is warm and crowded.   | GANDALF              |
| [Gandalf] *puffs pipe thoughtfully*       | Energy ████████░░ 80 |
| [You] What about the ring?                | Bored  ██░░░░░░░░ 20 |
| [Gandalf] The ring must be destroyed.     | State: COOLDOWN      |
| [Frodo] *gulps nervously*                 |                      |
| [Aragorn] Then we ride at dawn.           | FRODO                |
+--[Input]----------------------------------+ Energy ██████░░░░ 60 |
| > _                                       | State: IDLE          |
+-------------------------------------------+----------------------+
```

## Key Design Decisions

- **Conversation history**: Sliding window of 20 exchanges per character. No token counting.
- **Model per character**: Haiku for minor NPCs, Sonnet for main characters, Opus for the DM.
- **API failures**: Fall back to EMOTING (canned response). No retries.
- **Energy system**: Self-regulating cost governor. Characters can't spam the API.
- **Scene events suppressed during active conversation** (pacing < 3 ticks).

## License

MIT
