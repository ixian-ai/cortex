# Tutorial: Building a Cross-Universe AI Tavern Brawl

In this tutorial, you'll learn how FSM Agents works by building two complete crews, running them in their own scenes, and then smashing them together in a cross-universe incident involving a transporter malfunction, a quantum spacebat, and Amos Burton's opinions about bat'leths.

By the end, you'll understand:
- How to create characters with distinct personalities and behavior profiles
- How scenes control atmosphere, tension, and pacing
- How the FSM engine decides who talks, who emotes, and who shuts up
- How to run a scene and watch AI characters interact autonomously
- How to stage a cross-universe encounter that absolutely no one asked for

## Prerequisites

- [Bun](https://bun.sh) installed
- An Anthropic API key (`export ANTHROPIC_API_KEY=sk-ant-...`)
- `bun install` run in the project root

---

## Part 1: Understanding a Character File

Let's build Worf from scratch. Open `world/characters/enterprise/worf.mdx`:

### The Frontmatter: Stats and Behavior

```yaml
---
name: Worf
realm: star-trek
type: character
model: claude-sonnet-4-6
maxTokens: 250
```

The basics: a name, which universe ("realm") they belong to, which AI model powers them, and a token budget for responses. Worf is terse — 250 tokens is plenty.

### Triggers: When Does Worf Care?

```yaml
triggers:
  keywords: ["worf", "klingon", "honor", "battle", "weapons", "security",
             "tactical", "warrior", "combat", "fight", "threat", "intruder",
             "phaser", "torpedo", "bat'leth"]
  alwaysRespondTo: ["@worf", "@everyone"]
  randomChance: 0.08
```

This is the **zero-cost relevance engine**. Every tick, when a new message arrives, the FSM evaluates it against these rules using pure TypeScript string matching — no API call:

1. **`alwaysRespondTo`** — `@worf` or `@everyone` → guaranteed response (if Worf has energy)
2. **`keywords`** — if the message contains "weapons" or "honor" → high relevance → likely response
3. **`randomChance`** — 8% chance of responding to anything, even if not relevant

This is how 90% of the engine runs for free. Worf *hears* every message, but he only *responds* when it matters to him.

### Energy: The Cost Governor

```yaml
energy:
  max: 95
  responseCost: 30
  emoteCost: 5
  rechargeRate: 2
```

Worf starts with 95 energy. Each full response (API call) costs 30. Each emote (canned reaction) costs 5. He recharges 2 energy per tick (every 5 seconds).

The math: Worf gets **3 full responses** before he's drained. Then he needs ~48 ticks (~4 minutes) to fully recharge. During that time, he can still *emote* (6 emotes on a full charge), but he can't make API calls.

This is the self-regulating cost governor. No external throttle needed. Characters naturally take turns because they run out of energy.

### Boredom: The Conversation Starter

```yaml
boredom:
  threshold: 55
  increaseRate: 1.5
cooldownTicks: 2
```

Boredom increases by 1.5 each tick. At threshold 55, that's ~37 ticks (~3 minutes) of silence before Worf initiates conversation himself. This is how characters start talking without player input — boredom drives them to speak.

`cooldownTicks: 2` means after responding, Worf waits 2 ticks (10 seconds) before the FSM will evaluate him again. Prevents rapid-fire responses.

### Emotes: Free Reactions

```yaml
emotes:
  idle:
    - "*stands at the tactical station, hands clasped behind his back, scanning for threats*"
    - "*checks the phaser array status for the third time this watch*"
    - "*glowers at the viewscreen as if daring the universe to try something*"
  agree:
    - "*grunts in approval*"
  disagree:
    - "*a low growl rumbles in his chest*"
  respect:
    - "*his eyes narrow with something approaching admiration* You fight well."
```

Emotes cost only 5 energy and **never trigger an API call**. The FSM picks a random emote from the appropriate category based on the situation. They keep characters alive between real responses.

### The System Prompt: Who They Are

Everything below the `---` in the .mdx file is the character's system prompt — sent to the AI model when the character actually responds:

```markdown
You are Lieutenant Worf, son of Mogh, of the House of Martok...
You speak in clipped, direct sentences. You do not waste words...
You are fascinated by weapons and combat in all forms...
Keep responses brief and authoritative — one to three clipped sentences.
```

This only gets read when the FSM transitions to `RESPONDING`. Most of the time, Worf is running on the free emote/keyword/energy system above. The system prompt is the expensive part — used sparingly by design.

---

## Part 2: The Enterprise Bridge Crew

We've included 7 characters for the Enterprise. Here's how they differ in behavior:

| Character | Energy | Response Cost | Boredom Threshold | Random Chance | Personality |
|-----------|--------|--------------|-------------------|---------------|-------------|
| **Picard** | 100 | 30 | 50 | 15% | Measured authority, speaks when it matters |
| **Riker** | 90 | 25 | 45 | 12% | Confident, cracks jokes, acts decisively |
| **Data** | 120 | 20 | 60 | 15% | High energy, low cost — talks a LOT |
| **Geordi** | 85 | 25 | 50 | 10% | Enthusiastic about engineering |
| **Worf** | 95 | 30 | 55 | 8% | Terse, tactical, weapons enthusiast |
| **Troi** | 80 | 20 | 40 | 12% | Most reactive (low boredom threshold) |
| **Crusher** | 80 | 25 | 55 | 8% | Speaks up for medical situations |

Notice the tuning:
- **Data** has the most energy (120) and lowest response cost (20) — he's an android, he can afford to talk
- **Troi** has the lowest boredom threshold (40) — she senses emotions and speaks up first
- **Worf** and **Crusher** have the lowest random chance (8%) — they only speak when it's relevant
- **Picard** and **Data** have the highest random chance (15%) — the captain and the curious android

These numbers create natural conversation dynamics without any orchestration code.

---

## Part 3: Creating a Scene

Open `world/scenes/enterprise-bridge.mdx`. A scene defines the *world* the characters inhabit.

### Tone and Tension

```yaml
tone: professional
tensionKeywords: ["anomaly", "shields", "weapons", "red alert", "intruder",
                  "hostile", "attack", "danger", "threat"]
toneMap:
  professional: ["report", "status", "scan", "analysis", "systems"]
  tense: ["alert", "danger", "shields", "weapons", "hostile"]
  curious: ["fascinating", "unusual", "anomaly", "unknown"]
  casual: ["poker", "holodeck", "ten forward", "tea"]
```

The **scene engine** analyzes the last 5 messages for these keywords every tick — zero cost, pure string matching:

- **Tension** (0-10) rises when tension keywords appear (+0.5 per hit) and decays naturally (-0.1/tick)
- **Current tone** shifts based on which toneMap category has the most keyword hits
- When no keywords match, tone defaults to the scene's base tone (`professional`)

### Events by Tone

```yaml
events:
  professional:
    - weight: 0.08
      content: "*The Enterprise hums steadily, stars streaking past at warp speed.*"
  tense:
    - weight: 0.10
      content: "*The ship shudders as something impacts the deflector shields.*"
  curious:
    - weight: 0.08
      content: "*Sensors detect an unusual energy reading from the nearby nebula.*"
```

Scene events are drawn from the **current tone's pool**. If the crew is having a tense conversation (lots of "shields" and "weapons" keywords), the scene starts firing tense events (ship shudders, alarms sound). If they're relaxed, you get professional atmosphere (humming engines, routine chirps).

Events are suppressed when conversation is active (pacing < 3 ticks). They only fire during quiet moments, acting as a **pacemaker** that keeps things interesting during lulls.

### DM Escalation

```yaml
dmModel: claude-haiku-4-5-20251001
dmMaxTokens: 150
dmEscalationThreshold: 7
```

When tension reaches 7+ AND conversation has been quiet AND at least 30 seconds since the last DM call, the engine makes a single cheap AI call (~$0.0003) to generate a narrative DM beat. This is the *only* scene-level API call, and it's rare by design.

### The DM Prompt

The markdown body tells the DM how to narrate:

```markdown
You are the narrative engine for the bridge of the USS Enterprise NCC-1701-D...
Keep narration brief — one to two atmospheric sentences.
Do not speak for named characters. Do not resolve conflicts — create them.
```

---

## Part 4: Running the Enterprise Bridge

### Pointing the Engine at Your Scene

Edit `src/index.tsx` to load the Enterprise crew:

```typescript
const sceneFile = resolve(__dirname, '..', 'world', 'scenes', 'enterprise-bridge.mdx');
const charactersDir = resolve(__dirname, '..', 'world', 'characters', 'enterprise');
```

That's it. The engine loads all `.md` and `.mdx` files from the characters directory and the scene config from the scene file.

### Start It Up

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bun run start
```

### What You'll See

```
+--[Chat]-----------------------------------+--[Status]------------+
| [System] Welcome to USS Enterprise        | JEAN-LUC PICARD      |
|   NCC-1701-D Bridge. 7 characters are     | Energy ██████████ 100 |
|   present. Type a message to begin.       | Bored  ░░░░░░░░░░  0 |
|                                           | State: IDLE          |
| [Data] *tilts his head precisely 3.7      |                      |
|   degrees to the left, processing*        | WORF                 |
|                                           | Energy █████████░  95 |
| [Troi] *sits beside the captain, her      | Bored  ░░░░░░░░░░  0 |
|   dark eyes attentive*                    | State: IDLE          |
|                                           |                      |
+--[Input]----------------------------------+ ...                  |
| > _                                       |                      |
+-------------------------------------------+----------------------+
```

The first thing you'll notice: **characters emote before anyone speaks**. The emote system gives the bridge life immediately — Worf checking weapons, Data processing, Troi sensing the room. These are free (no API calls).

After ~30-40 seconds, boredom kicks in. Troi (lowest threshold at 40) will be the first to actually speak — she'll initiate conversation, probably about sensing something. This triggers other characters through keyword matching, and the conversation begins organically.

### Try These

Type `@everyone Report!` — watch all 7 characters respond in sequence, burning energy.

Type `I'm detecting an anomaly in the nebula` — Data and Geordi will respond (keyword match). The scene tone shifts toward "curious."

Type `Red alert! Shields up!` — Worf responds immediately (keyword match). Tension rises. Scene events shift to the tense pool.

Then just... wait. Watch the characters talk to each other. Watch energy drain. Watch emotes fill the gaps. Watch the scene engine pulse atmospheric events during quiet moments. This is the FSM at work.

---

## Part 5: The Rocinante

The Roci crew is a different vibe entirely. Four characters, cramped quarters, no protocol:

| Character | Energy | Response Cost | Boredom | Style |
|-----------|--------|--------------|---------|-------|
| **Holden** | 90 | 25 | 45 | Earnest idealist, speechifies |
| **Naomi** | 85 | 25 | 50 | Competent engineer, quiet center |
| **Amos** | 100 | 25 | 40 | Blunt, philosophical violence |
| **Alex** | 85 | 25 | 45 | Warm Texan pilot, everyman |

Notice: more uniform energy profiles. The Roci crew is egalitarian — no one character dominates. Amos has the lowest boredom threshold (40) because he gets antsy, and the highest energy (100) because... he's Amos.

To run the Roci by itself, edit `src/index.tsx`:

```typescript
const sceneFile = resolve(__dirname, '..', 'world', 'scenes', 'rocinante.mdx');
const charactersDir = resolve(__dirname, '..', 'world', 'characters', 'rocinante');
```

The Rocinante scene has a `casual` base tone. Events include coffee machines, country music, and maintenance alerts. When tension rises (torpedo keywords, hostile contacts), it shifts to combat mode with PDC spin-ups and evasive maneuvers.

---

## Part 6: The Crossover — "Quantum Spacebat Incident"

Here's where it gets fun.

### The Setup

The Enterprise is orbiting a nebula, trying to beam aboard an unusual lifeform — a "quantum spacebat" that exists partially in subspace. The transporter locks onto its biosignature. But a quantum string resonates between universes.

Meanwhile, on the Rocinante (in a completely different universe), Amos is in the cargo bay poking at a protomolecule artifact. Alex is in the cockpit drinking coffee.

The transporter beam follows the quantum string. Instead of the spacebat, Amos Burton and Alex Kamal materialize on the Enterprise bridge in a flash of blue-orange light. Amos is holding a wrench. Alex is holding a coffee cup. Neither is particularly impressed by the carpet.

### The Scene File

`world/scenes/enterprise-crossover.mdx` is configured for maximum chaos:

```yaml
tone: curious           # Starts with scientific wonder
dmEscalationThreshold: 6  # Lower than normal — this situation is weird
tensionKeywords: ["intruder", "weapons", "hostile", "quantum", "phaser",
                  "gun", "fight", "protomolecule", "PDC", "railgun"]
```

The **crossover-specific toneMap** adds categories you won't find in a normal scene:

```yaml
toneMap:
  curious: ["fascinating", "anomaly", "quantum", "universe", "dimension"]
  tense: ["weapons", "intruder", "hostile", "threat", "phaser"]
  bewildered: ["what", "how", "where", "impossible", "confused", "weird"]
  bonding: ["weapons", "combat", "honor", "fight", "warrior", "kinetic"]
```

The `bewildered` and `bonding` tones are unique to this crossover. As the conversation shifts from "what just happened" to "tell me about your weapons," the scene events shift too:

```yaml
events:
  bonding:
    - weight: 0.08
      content: "*Worf's tactical display shows a schematic — unbidden — of a weapon
               called a 'PDC.' The computer has no record of how it got there.*"
```

The transporter malfunction event has a high weight (0.30) so it fires during the first quiet moment:

```yaml
events:
  curious:
    - weight: 0.30
      content: "*The transporter console erupts in sparks. Two columns of
               blue-orange light materialize on the bridge — not the spacebat.
               Two men. One stocky and bald with a wrench. One lanky with a
               coffee cup. The bald one looks at Worf and tilts his head
               with interest.*"
```

### Loading the Crossover

For this scene, we need the Enterprise crew AND Amos and Alex. Edit `src/index.tsx`:

```typescript
const sceneFile = resolve(__dirname, '..', 'world', 'scenes', 'enterprise-crossover.mdx');
const charactersDir = resolve(__dirname, '..', 'world', 'characters', 'enterprise');

// ...after room.loadCharacters(charactersDir):

// Load the Rocinante crew for the crossover
const crossoverCharsDir = resolve(__dirname, '..', 'world', 'characters', 'rocinante');
room.loadCharacters(crossoverCharsDir);
```

`loadCharacters()` can be called multiple times — it just adds to the character map. So we load the Enterprise crew first, then add Amos and Alex (and Holden and Naomi, who'll be quiet since their keywords won't trigger on a Starfleet bridge).

You might also want to update the welcome message:

```typescript
room.addMessage({
  id: 'welcome',
  type: 'system',
  from: 'System',
  content: `The Enterprise is orbiting the Helix Nebula. A science team has identified a "quantum spacebat" — a creature existing partially in subspace. Captain Picard has ordered it beamed aboard for study. The transporter is charging...`,
  timestamp: Date.now(),
});
```

### Run It

```bash
bun run start
```

### What Happens Next

The first 30-60 seconds play out normally. Enterprise crew emotes. Maybe Picard comments on the mission. Data provides analysis. Normal bridge stuff.

Then **the transporter event fires**. The 0.30 weight means there's a 30% chance each tick (once pacing allows). When it hits, Amos and Alex "materialize" on the bridge via a scene event.

Now the FSM does its thing:

1. **Worf** — keywords "intruder" in the scene event → FSM transitions to LISTENING → HIGH relevance → RESPONDING. Worf will react to unknown people on the bridge. His hand goes to his phaser.

2. **Troi** — her empathic triggers fire. She senses Amos's emotional state: *extreme calm and a willingness for violence that is remarkable.* She senses Alex's emotional state: *confusion, fear, and... an intense desire for better coffee.*

3. **Data** — "fascinating" is literally one of his keywords. He starts scanning. He reports that their quantum signatures don't match this universe.

4. **Picard** — "intruder" plus the general commotion. He stands, tugs his uniform. "Report."

5. **Amos** — he's just appeared on an alien bridge with carpeting, surrounded by people in pajamas, next to a guy with a ridged forehead holding a glowing weapon. His boredom threshold is low (40) and his keywords include "weapons" and "fight." He's going to say something to Worf about that phaser. Or the bat'leth on the wall. Or both.

6. **Alex** — his keywords include "weird" things that would trigger on the cross-universe scenario. He's going to look at Worf's forehead and say what we're all thinking.

### The Weapons Conversation

Once Amos and Worf start talking about weapons, the `bonding` tone keywords activate: "weapons," "combat," "kinetic," "bat'leth." The scene engine shifts to the bonding event pool, which feeds in PDC schematics and Rocinante blueprints on the tactical display.

Amos: *"So that curved blade thing on the wall. You actually fight with that? Up close?"*

Worf: *explains bat'leth combat with barely-contained enthusiasm*

Amos: *"Huh. See, where I'm from, we shoot things. Railguns mostly. Magnetic acceleration, kinetic impact. No heat signature. Your shields stop that?"*

This is where the FSM shines. Worf's keywords include "bat'leth," "weapons," "combat," "warrior." Amos's keywords include "weapons," "kinetic," "railgun," "PDC." They'll keep triggering each other in a feedback loop — but the **energy system** prevents it from running away. After 3 exchanges each, they're both drained and will emote for a while before recharging.

Meanwhile, Data is fascinated by the dimensional physics. Picard is trying to maintain order. Troi is sensing the emotional dynamics. Crusher wants to scan the newcomers. Alex is asking increasingly inappropriate questions about Worf's forehead.

Nobody orchestrated this. The FSM did it with keyword matching, energy budgets, and boredom thresholds.

---

## Part 7: How the FSM Makes It Work

Let's trace what happens when the transporter event fires:

```
TICK 15:
  Scene engine: pacing = 4, tone = curious
  Roll event: 0.30 weight, roll = 0.18 → FIRES
  Scene event: "Two columns of blue-orange light materialize..."

  For each character, evaluate the scene event:

  Worf (IDLE):
    message contains "intruder"? → no (not literally, but "materialize" + context)
    keywords ["tactical", "intruder"] in content? → no direct hit
    But Worf will react on the NEXT message when someone says "intruder"

  Data (IDLE):
    keywords: "anomaly"? no. But randomChance 0.15 → roll 0.08 → RESPONDS
    → FSM: IDLE → RESPONDING → API call
    Data says: "Fascinating. Captain, sensors indicate..."

  Troi (IDLE):
    message is emotionally significant → keywords don't match but
    boredom was already at 38 → next tick pushes to 40.5 → RESPONDS
    → FSM: IDLE → RESPONDING → API call
    Troi says: "Captain, I'm sensing extreme calm from the larger one..."

TICK 16:
  Data's response contains "fascinating" → triggers Data's own cooldown
  Troi's response contains "sense" → no self-trigger (sender excluded)

  Worf (IDLE):
    Troi's message contains "extreme" + context about intruders
    randomChance 0.08 → roll 0.03 → RESPONDS
    → FSM: IDLE → RESPONDING → API call
    Worf says: "Captain, recommend we raise shields. I will handle security."

  Amos (IDLE):
    Worf's message contains "weapons"? No. "security"? Yes → keyword match
    → FSM: IDLE → LISTENING → MEDIUM relevance → probability gate
    Energy: 100, responseCost: 25 → has energy → RESPONDS
    Amos says: "Easy there, big guy. I'm not looking for trouble."

TICK 17:
  Amos's message contains "trouble" → tension keyword? No.
  But Worf is in COOLDOWN (2 ticks remaining).
  Alex's boredom hits threshold → RESPONDS
  Alex says: "Amos! Where the hell are we? And — sorry, uh, sir, but
             what's going on with your forehead?"
```

This trace is simplified, but it shows the principle: **characters respond based on relevance, energy, and timing** — not a central orchestrator deciding who speaks next.

---

## Part 8: Tuning Tips

### Characters Talk Too Much?
- Increase `responseCost` — fewer responses per energy cycle
- Increase `cooldownTicks` — longer pause between responses
- Increase `boredom.threshold` — longer silence before self-initiated speech
- Decrease `randomChance` — less likely to respond to irrelevant messages

### Characters Are Too Quiet?
- Decrease `boredom.threshold` — they'll initiate conversation sooner
- Increase `randomChance` — more likely to chime in
- Add more keywords — broader trigger surface
- Decrease `responseCost` — more responses per cycle

### Scene Events Fire Too Often?
- Lower event weights (0.03-0.05 is subtle, 0.10+ is frequent)
- The scene engine already suppresses events during active conversation (pacing < 3)

### Want More DM Narrative Beats?
- Lower `dmEscalationThreshold` — the DM activates at lower tension
- Add more tension keywords — tension rises faster
- Note: each DM call costs ~$0.0003 (haiku model), so even frequent calls are cheap

---

## Part 9: Going Further

### Add Your Own Characters

Create a new `.mdx` file in any `world/characters/` subdirectory. Required frontmatter:

```yaml
---
name: Your Character
realm: your-realm
type: character
model: claude-sonnet-4-6
maxTokens: 300
triggers:
  keywords: [...]
  alwaysRespondTo: ["@yourchar", "@everyone"]
  randomChance: 0.10
energy:
  max: 100
  responseCost: 25
  emoteCost: 5
  rechargeRate: 2
boredom:
  threshold: 50
  increaseRate: 2
cooldownTicks: 2
emotes:
  idle: ["*does something characteristic*"]
---

Your character's system prompt here...
```

### Cross-Universe Scenes

The realm system is just a label — characters from different realms interact normally. The FSM doesn't care if Gandalf meets Picard. The *characters* care, because their system prompts define their worldview. Drop a wizard onto a starship and the AI will figure it out.

### View Your World

The Astro viewer (`viewer/`) renders all `.mdx` files as browsable web pages:

```bash
cd viewer
bun install
bun run build    # generates static HTML in viewer/dist/
bun run dev      # or run the dev server at localhost:4321
```

Browse character stats, scene configurations, event pools, and system prompts — all generated from the same `.mdx` files that power the engine.

---

## The Point

The FSM engine doesn't decide *what* characters say — the AI does that. The FSM decides *whether* they speak at all. And that decision is free. Keyword matching, energy budgets, boredom thresholds, cooldown timers — all deterministic, all zero-cost.

The result: 11 characters in a room, each with their own personality, behavioral profile, and conversational style, interacting autonomously. 90%+ of the engine's runtime costs nothing. The expensive AI calls happen only when a character has something to say and the energy to say it.

Now go put Amos in a room with Worf and watch them bond over kinetic weapons. You've earned it.
