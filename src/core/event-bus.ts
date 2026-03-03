import { EventEmitter } from 'events';
import type { EngineEvent, CharacterState, RoomMessage } from '../types.js';

type EventMap = {
  event: [EngineEvent];
  stateChange: [string, CharacterState];
  roomMessage: [RoomMessage];
};

type EventKey = keyof EventMap;

export class EventBus {
  private emitter = new EventEmitter();

  emit<K extends EventKey>(type: K, ...args: EventMap[K]): void {
    this.emitter.emit(type, ...args);
  }

  on<K extends EventKey>(type: K, handler: (...args: EventMap[K]) => void): void {
    this.emitter.on(type, handler as (...args: unknown[]) => void);
  }

  off<K extends EventKey>(type: K, handler: (...args: EventMap[K]) => void): void {
    this.emitter.off(type, handler as (...args: unknown[]) => void);
  }

  onRoomMessage(handler: (msg: RoomMessage) => void): void {
    this.on('roomMessage', handler);
  }

  onStateChange(handler: (name: string, state: CharacterState) => void): void {
    this.on('stateChange', handler);
  }

  removeAllListeners(type?: EventKey): void {
    type ? this.emitter.removeAllListeners(type) : this.emitter.removeAllListeners();
  }
}
