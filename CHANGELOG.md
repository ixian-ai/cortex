# Changelog

## v0.1.0 — The One Where It All Came Together

### The Engine

Built the core FSM engine from scratch. Characters tick on a 5-second clock, evaluate incoming messages with zero-cost keyword matching, and only fire API calls when the finite state machine says they should. Energy depletes on responses, recharges over time. Boredom increases when characters are idle and triggers self-initiated conversation. The whole thing self-regulates — no external throttling needed.

Five FSM states: IDLE, LISTENING, RESPONDING, EMOTING, COOLDOWN. Only RESPONDING costs money. Everything else is pure TypeScript.

### The Scene Engine

Started with a dumb weighted random table for scene events. Replaced it with a reactive scene FSM that tracks tension (from conversation keyword analysis), tone (calm/tense/jovial/somber), and pacing (suppresses events during active conversation). Scene events are drawn from tone-matched pools. When tension exceeds a configurable threshold, the engine makes a single cheap AI call for a DM narrative beat (~$0.0003 per call).

### The Characters

Three characters for the Prancing Pony scene: Gandalf (wise, measured, high energy pool), Frodo (anxious, reactive, low boredom threshold), and Aragorn (watchful, expensive responses, high boredom threshold). Each defined in a markdown file with YAML frontmatter for stats and markdown body for system prompt.

### The TUI

React-based terminal UI using ink. Chat pane with color-coded messages (cyan for player, yellow for scene events, green for emotes, magenta for character names). Status sidebar showing per-character energy bars, boredom bars, and FSM state. Manual scroll with arrow keys. Text input at the bottom.

### The MDX Pivot

Converted all world files from `.md` to `.mdx` and made them dual-purpose: the runtime engine reads them with gray-matter for config, and an Astro site reads the same files via content collections for a browsable world viewer. One file, two consumers, zero duplication.

### The Viewer

Built an Astro 5 site that renders all world resources. Dark GitHub-style theme. Card grid index page grouped by type (characters, scenes). Detail pages showing stats, triggers, emotes, tension keywords, tone maps, event pools, and system prompts. Builds to static HTML.

### First Run

It worked on the first real test. All three characters drained energy organically, scene events fired on schedule, characters talked to each other unprompted when bored, and the tavern felt alive. The player couldn't type fast enough because the characters were already deep in conversation.
