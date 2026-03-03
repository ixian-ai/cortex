import { EventBus } from './event-bus.js';

/**
 * Tick clock that drives the engine.
 * Emits tick events on the EventBus at a configurable interval.
 */
export class Clock {
  private eventBus: EventBus;
  private tickRate: number;
  private tickCount = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(eventBus: EventBus, tickRate: number = 5000) {
    this.eventBus = eventBus;
    this.tickRate = tickRate;
  }

  start(): void {
    if (this.intervalId !== null) return; // already running

    this.intervalId = setInterval(() => {
      this.tickCount++;
      this.eventBus.emit('event', {
        type: 'tick',
        tickNumber: this.tickCount,
        timestamp: Date.now(),
      });
    }, this.tickRate);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setRate(ms: number): void {
    this.tickRate = ms;
    // If currently running, restart with the new rate
    if (this.intervalId !== null) {
      this.stop();
      this.start();
    }
  }

  getTickCount(): number {
    return this.tickCount;
  }
}
