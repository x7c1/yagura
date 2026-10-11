/** Cancels a scheduled callback; does nothing once it has run. */
export type CancelTimer = () => void;

/** Schedules callbacks after a delay. */
export interface Timer {
  schedule(callback: () => void, delayMs: number): CancelTimer;
}

/** A timer over the global `setTimeout`. */
export class GlobalTimer implements Timer {
  schedule(callback: () => void, delayMs: number): CancelTimer {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  }
}

interface Scheduled {
  readonly dueAt: number;
  readonly order: number;
  readonly callback: () => void;
}

/**
 * A timer that never fires on its own. `advance` moves its clock forward and
 * runs the callbacks that fall due, in due order.
 */
export class ManualTimer implements Timer {
  #now = 0;
  #nextOrder = 0;
  readonly #scheduled = new Set<Scheduled>();

  /** Milliseconds advanced so far. */
  get now(): number {
    return this.#now;
  }

  /** The number of callbacks scheduled and not yet run or cancelled. */
  get pending(): number {
    return this.#scheduled.size;
  }

  schedule(callback: () => void, delayMs: number): CancelTimer {
    const entry: Scheduled = {
      dueAt: this.#now + Math.max(0, delayMs),
      order: this.#nextOrder++,
      callback,
    };
    this.#scheduled.add(entry);
    return () => {
      this.#scheduled.delete(entry);
    };
  }

  /**
   * Advances the clock by `ms`, running every callback due by then,
   * including ones scheduled by callbacks that ran.
   */
  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      const next = this.#nextDue(target);
      if (!next) {
        break;
      }
      this.#scheduled.delete(next);
      this.#now = next.dueAt;
      next.callback();
    }
    this.#now = target;
  }

  #nextDue(target: number): Scheduled | undefined {
    let next: Scheduled | undefined;
    for (const entry of this.#scheduled) {
      if (
        entry.dueAt <= target &&
        (!next ||
          entry.dueAt < next.dueAt ||
          (entry.dueAt === next.dueAt && entry.order < next.order))
      ) {
        next = entry;
      }
    }
    return next;
  }
}
