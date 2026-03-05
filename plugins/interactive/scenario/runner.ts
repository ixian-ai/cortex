import type { Room } from '../core/room.js';
import type { RoomMessage } from '../types.js';

export interface ScenarioOptions {
  maxTicks: number;
  maxMessages: number;
  verbose: boolean;
}

export interface ScenarioResult {
  messages: RoomMessage[];
  ticks: number;
}

/**
 * ScenarioRunner — autonomous fast-loop execution.
 *
 * Runs the FSM engine without a clock or player input. Ticks fire
 * as fast as API responses complete. Boredom drives character initiation;
 * scene events provide the opening spark.
 *
 * Do NOT call room.start() — this uses room.tick() directly.
 */
export class ScenarioRunner {
  private room: Room;

  constructor(room: Room) {
    this.room = room;
  }

  async run(options: ScenarioOptions): Promise<ScenarioResult> {
    const captured: RoomMessage[] = [];
    let tickCount = 0;

    const onMessage = (msg: RoomMessage) => {
      captured.push(msg);
      if (options.verbose && msg.type !== 'system') {
        console.log(formatMessage(msg));
      }
    };

    this.room.on('roomMessage', onMessage);

    try {
      while (tickCount < options.maxTicks && captured.length < options.maxMessages) {
        if (options.verbose) {
          process.stdout.write(`\r[tick ${tickCount + 1}/${options.maxTicks}] messages: ${captured.length}  `);
        }

        await this.room.tick(tickCount);
        tickCount++;

        // Stop early if all characters are exhausted and silent
        if (this.allCharactersExhausted()) {
          if (options.verbose) {
            console.log(`\n[Runner] All characters exhausted. Stopping at tick ${tickCount}.`);
          }
          break;
        }
      }
    } finally {
      this.room.off('roomMessage', onMessage);
    }

    if (options.verbose) {
      process.stdout.write('\n');
    }

    return { messages: captured, ticks: tickCount };
  }

  private allCharactersExhausted(): boolean {
    for (const [, char] of this.room.getCharacters()) {
      const canRespond = char.state.energy >= char.config.energy.responseCost;
      const isBored = char.state.boredom >= char.config.boredom.threshold;
      if (canRespond || isBored) return false;
    }
    return true;
  }
}

function formatMessage(msg: RoomMessage): string {
  const divider = '─'.repeat(50);
  switch (msg.type) {
    case 'scene':
      return `\n${divider}\n[SCENE] ${msg.content}\n${divider}`;
    case 'emote':
      return `\n  * ${msg.from} ${msg.content}`;
    case 'system':
      return `\n[system] ${msg.content}`;
    default:
      return `\n[${msg.from}] ${msg.content}`;
  }
}
