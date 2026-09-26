import type { Logger } from '@nestjs/common';

type Task = () => void | Promise<void>;

/**
 * Side effects (socket emits, DB writes, timers) collected while a room is being
 * mutated and executed in order only after the new state has been saved, still
 * inside the room lock — so clients never see a state that was not persisted and
 * emissions for one room are never reordered.
 */
export class Effects {
  private readonly tasks: { key: string | null; run: Task }[] = [];

  defer(task: Task): void {
    this.tasks.push({ key: null, run: task });
  }

  /** Like `defer`, but a later task with the same key replaces (and moves after) the earlier one. */
  deferLatest(key: string, task: Task): void {
    const index = this.tasks.findIndex((t) => t.key === key);
    if (index !== -1) this.tasks.splice(index, 1);
    this.tasks.push({ key, run: task });
  }

  async flush(logger: Logger): Promise<void> {
    for (const { run: task } of this.tasks) {
      try {
        await task();
      } catch (error) {
        logger.error({ err: error }, 'Deferred room effect failed');
      }
    }
  }
}
