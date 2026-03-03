# How We Got Here

This is the story of how a question about Claude Code output styles turned into a game-engine-inspired multi-agent chat system. It's worth writing down because the architecture didn't come from a spec — it came from a conversation, and the key insights were analogies to systems that have nothing to do with AI.

## It Started With Roleplay

The original question was innocent enough: "Can I create roleplay characters with output styles and have them interact like in a chat room?"

The answer was no — not really. Output styles are per-session. You could fake it by cramming all characters into one context, but then the context fills up 3x faster, every character knows everything, and there's no individual agency. The alternative — separate Claude Code instances — gives you real isolation but no shared conversation space.

That tension (shared context vs. independent agents) is the core problem of multi-agent systems.

## The Invocation Cost Problem

We looked at [hcom](https://github.com/aannoo/hcom), a Rust-based multi-agent communication framework that uses SQLite for message passing and hooks for triggers. Interesting, but heavy. The real question was simpler: if every chat message invokes every agent, costs explode. Three characters in a room, each responding to each other's messages — that's a cascade. And you're paying for every API call.

The user put it perfectly: *"every chat message would be a LOT of invocations."*

## Hardware Analogies

This is where the conversation got interesting. The user started drawing analogies to hardware:

- **Carrier signal / clock** — a steady pulse that drives the system, not every pulse carries data
- **IRQ (Interrupt Request)** — certain events demand immediate attention, others don't
- **DMA (Direct Memory Access)** — some operations bypass the expensive CPU entirely

Then the question: *"How do GAMES handle this?"*

Games have solved this problem for decades. They run hundreds of entities at 60fps without every entity making a "decision" every frame. The answer is a combination of:

- **Finite State Machines** — each entity has a state, transitions are deterministic
- **Entity Component Systems** — separate data from behavior, evaluate cheaply
- **Action Points / Energy** — limit how often expensive operations fire
- **Level of Detail** — distant entities get cheaper evaluation
- **Event systems** — not everything polls; some things react to events

## The FSM Breakthrough

Map these game-engine patterns onto AI agents:

| Game Concept | Agent Equivalent |
|---|---|
| Entity FSM states | IDLE → LISTENING → RESPONDING → COOLDOWN |
| Health/mana | Energy system (depletes on API calls, recharges over time) |
| Idle animations | Emote templates (zero-cost canned reactions) |
| Aggro radius | Keyword triggers + @mention detection |
| Action points | Response cost + cooldown ticks |
| Random encounters | Scene events (weighted dice rolls) |
| Boss AI phases | Boredom threshold (initiates conversation when bored) |

The key insight: **LISTENING is free.** When a message arrives, each character evaluates relevance using pure TypeScript string matching — keyword hits, @mentions, random chance. No API call. Only if the character decides to *actually respond* does the FSM transition to RESPONDING and fire an API call.

A character with 100 energy and 30 response cost gets about 3 full responses before going quiet. At 2 energy per tick and 5-second ticks, that's 75 seconds to recharge. The system self-regulates without any external throttling.

## The systemd Digression

Brief but worth noting: we explored whether each agent could be a systemd unit. It maps surprisingly well — socket activation is the interrupt model, timer units are the clock, process isolation is free, cgroups give you resource limits, idle timeout is level-of-detail. The user's reaction was "ohmy.mrsulu.gif." We shelved it for later. It's still a good idea.

## Building It

Implementation was straightforward once the architecture was clear:

1. **Core engine** — types, event bus, clock, FSM, relevance matcher, room, scene engine
2. **Agent runtime** — thin Anthropic SDK wrapper with per-character system prompts and sliding window history
3. **TUI** — React-based terminal UI with ink (chat pane, status sidebar, input bar)
4. **Characters** — three markdown files: Gandalf, Frodo, Aragorn

First run: all three characters drained energy organically, scene events fired on schedule, characters initiated conversations when bored, and the whole thing felt alive. The user couldn't even type fast enough because the characters were already talking to each other.

## Scene Agency

The initial scene engine was a dumb weighted random table — roll dice each tick, maybe fire an event. It worked but felt mechanical. The fix: give the scene its own FSM.

The reactive scene engine tracks:
- **Tension** (0-10) — rises when conversation hits tension keywords, decays naturally
- **Tone** (calm/tense/jovial/somber) — derived from keyword analysis of recent messages
- **Pacing** — ticks since last activity, suppresses events during rapid conversation

Scene events are drawn from the *current tone's pool*, not a flat table. When tension exceeds a threshold (and enough time has passed), the engine makes a single cheap AI call for a DM narrative beat. The DM call costs ~$0.0003 and is stateless — no conversation history, just current scene state.

## The MDX Revelation

The user suggested making everything `.mdx` files. This was a great idea for a non-obvious reason: the same files that configure the runtime engine also serve as content for an Astro documentation site. Gray-matter parses the YAML frontmatter for the engine; Astro's content collections parse the same files for the viewer.

Single source of truth. You edit one file and both the engine behavior *and* the documentation update.

We built an Astro viewer that displays all world resources — characters with their stats, triggers, and emotes; scenes with their tension keywords, tone maps, and event pools. Dark theme, card grid, detail pages. It builds to a static site.

## What's Next

The architecture is realm-agnostic. Characters have a `realm` field. Scenes have a `realm` field. Nothing stops you from loading Amos Burton (The Expanse) into a Star Trek scene and watching him talk to Worf about kinetic weapons while Alex freaks out about the ridges on Worf's forehead.

That's the plan.
