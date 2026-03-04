import type {
  Character,
  CharacterConfig,
  CharacterState,
  RoomMessage,
  RoomConfig,
  SceneConfig,
  SceneState,
  EngineEvent,
} from '../types.js';
import { EventBus } from './event-bus.js';
import { Clock } from './clock.js';
import { evaluateFSM, tickState } from './fsm.js';
import {
  rollSceneEvent,
  tickSceneState,
  shouldEscalateToDM,
  createSceneState,
} from './scene-engine.js';
import { v4 as uuid } from 'uuid';
import matter from 'gray-matter';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

type ResponseHandler = (character: Character, context: RoomMessage[]) => Promise<string>;
type DMResponseHandler = (
  sceneConfig: SceneConfig,
  sceneState: SceneState,
  recentMessages: RoomMessage[]
) => Promise<string>;

/**
 * The Room — central state manager and heart of the engine.
 * Owns the EventBus, Clock, characters, and message log.
 * Orchestrates tick processing, FSM evaluation, and async API responses.
 */
export class Room {
  readonly config: RoomConfig;
  readonly eventBus: EventBus;
  private clock: Clock;
  private characters: Map<string, Character> = new Map();
  private messages: RoomMessage[] = [];
  private responseHandler: ResponseHandler | null = null;
  private dmResponseHandler: DMResponseHandler | null = null;

  sceneConfig: SceneConfig | null = null;
  sceneState: SceneState | null = null;

  constructor(config: RoomConfig, sceneConfig?: SceneConfig | null) {
    // If a scene config is provided, derive tickRate and maxMessages from it
    if (sceneConfig) {
      this.config = {
        ...config,
        tickRate: sceneConfig.tickRate,
        maxMessages: sceneConfig.maxMessages,
        name: sceneConfig.name,
      };
      this.sceneConfig = sceneConfig;
      this.sceneState = createSceneState(sceneConfig);
    } else {
      this.config = config;
    }

    this.eventBus = new EventBus();
    this.clock = new Clock(this.eventBus, this.config.tickRate);
  }

  // ── Scene loading ─────────────────────────────────────────────────────

  loadScene(filePath: string): SceneConfig {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);

    // Extract description from the first section of the markdown body
    const lines = content.trim().split('\n');
    const descriptionLines: string[] = [];
    for (const line of lines) {
      // Stop at the first heading after the initial content
      if (descriptionLines.length > 0 && line.startsWith('#')) break;
      descriptionLines.push(line);
    }

    const sceneConfig: SceneConfig = {
      name: data.name,
      realm: data.realm ?? 'unknown',
      tone: data.tone ?? 'calm',
      tickRate: data.tickRate ?? 5000,
      maxMessages: data.maxMessages ?? 200,
      dmModel: data.dmModel ?? 'claude-sonnet-4-6',
      dmMaxTokens: data.dmMaxTokens ?? 300,
      dmEscalationThreshold: data.dmEscalationThreshold ?? 7,
      tensionKeywords: data.tensionKeywords ?? [],
      toneMap: data.toneMap ?? {},
      events: data.events ?? {},
      dmSystemPrompt: content.trim(),
      description: descriptionLines.join('\n').trim(),
    };

    this.sceneConfig = sceneConfig;
    this.sceneState = createSceneState(sceneConfig);

    // Update room config with scene-derived values
    (this.config as any).tickRate = sceneConfig.tickRate;
    (this.config as any).maxMessages = sceneConfig.maxMessages;
    (this.config as any).name = sceneConfig.name;

    // Update the clock with the new tick rate
    this.clock.setRate(sceneConfig.tickRate);

    return sceneConfig;
  }

  // ── Character loading ──────────────────────────────────────────────────

  loadCharacters(dirPath: string): void {
    const files = readdirSync(dirPath).filter(
      (f) => f.endsWith('.md') || f.endsWith('.mdx')
    );
    for (const file of files) {
      this.parseAndAddCharacter(join(dirPath, file));
    }
  }

  /** Load a specific list of character files (for scenario mode). */
  loadCharacterFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      this.parseAndAddCharacter(filePath);
    }
  }

  private parseAndAddCharacter(filePath: string): void {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);

    const cfg: CharacterConfig = {
      name: data.name,
      realm: data.realm ?? 'unknown',
      type: data.type ?? 'character',
      model: data.model,
      maxTokens: data.maxTokens ?? 200,
      triggers: {
        keywords: data.triggers?.keywords ?? [],
        alwaysRespondTo: data.triggers?.alwaysRespondTo ?? [],
        randomChance: data.triggers?.randomChance ?? 0.05,
      },
      energy: {
        max: data.energy?.max ?? 10,
        responseCost: data.energy?.responseCost ?? 3,
        emoteCost: data.energy?.emoteCost ?? 1,
        rechargeRate: data.energy?.rechargeRate ?? 1,
      },
      boredom: {
        threshold: data.boredom?.threshold ?? 5,
        increaseRate: data.boredom?.increaseRate ?? 0.5,
      },
      cooldownTicks: data.cooldownTicks ?? 2,
      emotes: data.emotes ?? { idle: ['...'] },
      systemPrompt: content.trim(),
    };

    const initialState: CharacterState = {
      fsm: 'IDLE',
      energy: cfg.energy.max,
      boredom: 0,
      mood: 0,
      cooldownRemaining: 0,
      lastSpoke: 0,
      attention: [],
    };

    this.characters.set(cfg.name, {
      config: cfg,
      state: initialState,
      history: [],
    });
  }

  // ── Message management ─────────────────────────────────────────────────

  addMessage(msg: RoomMessage): void {
    this.messages.push(msg);
    this.eventBus.emit('roomMessage', msg);

    // Trim to maxMessages
    if (this.messages.length > this.config.maxMessages) {
      this.messages = this.messages.slice(-this.config.maxMessages);
    }

    // Reset pacing counter when a message arrives (conversation is active)
    if (this.sceneState && msg.type === 'message') {
      this.sceneState = { ...this.sceneState, pacing: 0 };
    }
  }

  getCharacters(): Map<string, Character> {
    return this.characters;
  }

  getMessages(): RoomMessage[] {
    return this.messages;
  }

  getSceneState(): SceneState | null {
    return this.sceneState;
  }

  getSceneConfig(): SceneConfig | null {
    return this.sceneConfig;
  }

  // ── Event proxy (for TUI subscription) ─────────────────────────────────

  on(type: 'event' | 'stateChange' | 'roomMessage', handler: (...args: any[]) => void): void {
    this.eventBus.on(type as any, handler);
  }

  off(type: 'event' | 'stateChange' | 'roomMessage', handler: (...args: any[]) => void): void {
    this.eventBus.off(type as any, handler);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    this.eventBus.on('event', (event) => this.handleEvent(event));
    this.clock.start();
  }

  stop(): void {
    this.clock.stop();
    this.eventBus.removeAllListeners();
  }

  /**
   * Scenario mode: manually fire one tick and await all responses.
   * Bypasses the setInterval clock — caller controls timing.
   * Do NOT call start() when using this.
   */
  async tick(tickNumber: number = 0): Promise<void> {
    return this.handleTick({
      type: 'tick',
      tickNumber,
      timestamp: Date.now(),
    });
  }

  // ── Player input ───────────────────────────────────────────────────────

  handlePlayerMessage(content: string): void {
    const msg: RoomMessage = {
      id: uuid(),
      type: 'message',
      from: 'You',
      content,
      timestamp: Date.now(),
    };

    this.addMessage(msg);

    const event: EngineEvent = {
      type: 'message',
      from: 'You',
      content,
      timestamp: Date.now(),
    };

    this.handleMessageEvent(event, 'You');
  }

  // ── Response callback registration ─────────────────────────────────────

  onNeedResponse(handler: ResponseHandler): void {
    this.responseHandler = handler;
  }

  onNeedDMResponse(handler: DMResponseHandler): void {
    this.dmResponseHandler = handler;
  }

  // ── Event handling ─────────────────────────────────────────────────────

  private handleEvent(event: EngineEvent): void {
    if (event.type === 'tick') {
      this.handleTick(event);
    }
  }

  private async handleTick(tickEvent: EngineEvent): Promise<void> {
    // 1. Update internal state for each character
    for (const [name, char] of this.characters) {
      char.state = tickState(char.state, char.config);
    }

    // 2. Tick the scene state if we have a scene config
    if (this.sceneConfig && this.sceneState) {
      this.sceneState = tickSceneState(this.sceneState, this.messages, this.sceneConfig);

      // 3. Roll for scene events using the reactive, tone-aware engine
      const sceneContent = rollSceneEvent(this.sceneConfig, this.sceneState);

      if (sceneContent) {
        // Reset pacing after a scene event fires
        this.sceneState = { ...this.sceneState, pacing: 0 };

        const sceneMsg: RoomMessage = {
          id: uuid(),
          type: 'scene',
          from: 'Scene',
          content: sceneContent,
          timestamp: Date.now(),
        };
        this.addMessage(sceneMsg);

        const sceneEvent: EngineEvent = {
          type: 'scene',
          content: sceneContent,
          timestamp: Date.now(),
        };

        // Evaluate scene event against all characters
        for (const [name, char] of this.characters) {
          await this.evaluateAndAct(char, sceneEvent);
        }
      }

      // 4. Check if the DM should escalate for a narrative beat
      if (shouldEscalateToDM(this.sceneState, this.sceneConfig) && this.dmResponseHandler) {
        this.sceneState = { ...this.sceneState, ticksSinceLastDM: 0 };

        try {
          const dmContent = await this.dmResponseHandler(
            this.sceneConfig,
            this.sceneState,
            this.messages.slice(-10)
          );

          if (dmContent) {
            const dmMsg: RoomMessage = {
              id: uuid(),
              type: 'scene',
              from: 'DM',
              content: dmContent,
              timestamp: Date.now(),
            };
            this.addMessage(dmMsg);
          }
        } catch {
          // DM escalation failed — silent fallback, no crash
        }
      }
    } else {
      // Fallback: no scene config, use the old sceneEvents array from RoomConfig
      const sceneEvents = this.config.sceneEvents;
      if (sceneEvents.length > 0) {
        for (const event of sceneEvents) {
          if (Math.random() < event.weight) {
            const sceneMsg: RoomMessage = {
              id: uuid(),
              type: 'scene',
              from: 'Scene',
              content: event.content,
              timestamp: Date.now(),
            };
            this.addMessage(sceneMsg);

            const sceneEvent: EngineEvent = {
              type: 'scene',
              content: event.content,
              timestamp: Date.now(),
            };

            for (const [name, char] of this.characters) {
              await this.evaluateAndAct(char, sceneEvent);
            }
            break; // only one scene event per tick
          }
        }
      }
    }

    // 5. Evaluate tick event against each character
    for (const [name, char] of this.characters) {
      await this.evaluateAndAct(char, tickEvent);
    }
  }

  private handleMessageEvent(event: EngineEvent, senderName: string): void {
    for (const [name, char] of this.characters) {
      // Don't evaluate the sender against their own message
      if (name === senderName) continue;
      this.evaluateAndAct(char, event);
    }
  }

  // ── FSM evaluation and action dispatch ─────────────────────────────────

  private async evaluateAndAct(
    char: Character,
    event: EngineEvent
  ): Promise<void> {
    const transition = evaluateFSM(event, char.state, char.config);
    const prevState = char.state.fsm;
    char.state = { ...char.state, fsm: transition.nextState };

    // Handle transitions
    switch (transition.action) {
      case 'emote':
        this.handleEmote(char, transition.emoteCategory ?? 'idle');
        break;

      case 'respond':
      case 'initiate':
        await this.handleResponse(char);
        break;

      case 'none':
      default:
        break;
    }

    // Emit state change if the FSM state or anything observable changed
    this.eventBus.emit('stateChange', char.config.name, { ...char.state });
  }

  // ── Emoting ────────────────────────────────────────────────────────────

  private handleEmote(char: Character, category: string): void {
    const emoteList = char.config.emotes[category] ?? char.config.emotes['idle'] ?? ['...'];
    const emote = emoteList[Math.floor(Math.random() * emoteList.length)];

    const msg: RoomMessage = {
      id: uuid(),
      type: 'emote',
      from: char.config.name,
      content: emote,
      timestamp: Date.now(),
    };

    this.addMessage(msg);

    // Deduct emote energy and transition back to IDLE
    char.state = {
      ...char.state,
      fsm: 'IDLE',
      energy: Math.max(0, char.state.energy - char.config.energy.emoteCost),
      lastSpoke: Date.now(),
    };
  }

  // ── Responding (async API bridge) ──────────────────────────────────────

  private async handleResponse(char: Character): Promise<void> {
    if (!this.responseHandler) {
      // No handler registered — fall back to IDLE
      char.state = { ...char.state, fsm: 'IDLE' };
      return;
    }

    char.state = { ...char.state, fsm: 'RESPONDING' };
    this.eventBus.emit('stateChange', char.config.name, { ...char.state });

    try {
      const context = this.messages.slice(-20); // recent context window
      const responseContent = await this.responseHandler(char, context);

      const msg: RoomMessage = {
        id: uuid(),
        type: 'message',
        from: char.config.name,
        content: responseContent,
        timestamp: Date.now(),
      };

      this.addMessage(msg);

      // Append to character's conversation history
      char.history.push({ role: 'assistant', content: responseContent });

      // Transition to COOLDOWN, deduct energy, reset boredom
      char.state = {
        ...char.state,
        fsm: 'COOLDOWN',
        energy: Math.max(0, char.state.energy - char.config.energy.responseCost),
        cooldownRemaining: char.config.cooldownTicks,
        boredom: 0,
        lastSpoke: Date.now(),
      };
    } catch {
      // API error — transition back to IDLE so the character isn't stuck
      char.state = { ...char.state, fsm: 'IDLE' };
    }

    this.eventBus.emit('stateChange', char.config.name, { ...char.state });
  }
}
