import type {
  ValidatedLogEntry,
} from "../domain/log.js";

import type {
  LogBatchWriter,
} from "./log-batch-writer.js";

export class ParallelLogWriter
implements LogBatchWriter {
  private readonly available:
    number[] = [];

  private readonly waiters:
    Array<(
      writerIndex: number,
    ) => void> = [];

  private started = false;

  private closed = false;

  public constructor(
    private readonly writers:
      readonly LogBatchWriter[],
  ) {
    if (writers.length === 0) {
      throw new Error(
        "ParallelLogWriter requires at least one writer",
      );
    }
  }

  public async start():
    Promise<void> {
    if (this.closed) {
      throw new Error(
        "Parallel log writer is closed",
      );
    }

    if (this.started) {
      return;
    }

    try {
      await Promise.all(
        this.writers.map(
          (writer) => writer.start(),
        ),
      );
    } catch (error: unknown) {
      await Promise.allSettled(
        this.writers.map(
          (writer) => writer.close(),
        ),
      );

      this.closed = true;

      throw error;
    }

    for (
      let index = 0;
      index < this.writers.length;
      index += 1
    ) {
      this.available.push(index);
    }

    this.started = true;
  }

  private async acquireWriter():
    Promise<number> {
    const available =
      this.available.pop();

    if (available !== undefined) {
      return available;
    }

    return new Promise<number>(
      (resolve) => {
        this.waiters.push(resolve);
      },
    );
  }

  private releaseWriter(
    writerIndex: number,
  ): void {
    const waiter =
      this.waiters.shift();

    if (waiter !== undefined) {
      waiter(writerIndex);
      return;
    }

    this.available.push(
      writerIndex,
    );
  }

  public async write(
    logs: readonly ValidatedLogEntry[],
  ): Promise<void> {
    if (this.closed) {
      throw new Error(
        "Parallel log writer is closed",
      );
    }

    await this.start();

    const writerIndex =
      await this.acquireWriter();

    const writer =
      this.writers[writerIndex];

    if (writer === undefined) {
      this.releaseWriter(
        writerIndex,
      );

      throw new Error(
        "Parallel log writer selected an invalid writer",
      );
    }

    try {
      await writer.write(logs);
    } finally {
      this.releaseWriter(
        writerIndex,
      );
    }
  }

  public async close():
    Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    await Promise.all(
      this.writers.map(
        (writer) => writer.close(),
      ),
    );
  }
}
