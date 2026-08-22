import {
  describe,
  expect,
  test,
} from "vitest";

import type {
  ValidatedLogEntry,
} from "../../src/domain/log.js";

import type {
  LogBatchWriter,
} from "../../src/ingestion/log-batch-writer.js";

import {
  ParallelLogWriter,
} from "../../src/ingestion/parallel-log-writer.js";

const TEST_LOG:
  ValidatedLogEntry = {
    timestamp:
      "2026-08-09T12:00:00Z",
    level: "info",
    service: "parallel-test",
    message: "test",
    attributes: {},
  };

class ControlledWriter
implements LogBatchWriter {
  public writes = 0;

  public started = false;

  public closed = false;

  private readonly releases:
    Array<() => void> = [];

  public async start():
    Promise<void> {
    this.started = true;
  }

  public async write(
    _logs: readonly ValidatedLogEntry[],
  ): Promise<void> {
    this.writes += 1;

    await new Promise<void>(
      (resolve) => {
        this.releases.push(resolve);
      },
    );
  }

  public releaseNext(): void {
    this.releases.shift()?.();
  }

  public async close():
    Promise<void> {
    this.closed = true;

    for (const release of this.releases) {
      release();
    }

    this.releases.length = 0;
  }
}

async function nextTurn():
  Promise<void> {
  await new Promise<void>(
    (resolve) => {
      setImmediate(resolve);
    },
  );
}

describe(
  "ParallelLogWriter",
  () => {
    test(
      "leases each writer to at most one concurrent batch",
      async () => {
        const first =
          new ControlledWriter();
        const second =
          new ControlledWriter();

        const writer =
          new ParallelLogWriter([
            first,
            second,
          ]);

        await writer.start();

        const firstWrite =
          writer.write([TEST_LOG]);
        const secondWrite =
          writer.write([TEST_LOG]);

        await nextTurn();

        expect(
          first.writes + second.writes,
        ).toBe(2);

        const thirdWrite =
          writer.write([TEST_LOG]);

        await nextTurn();

        expect(
          first.writes + second.writes,
        ).toBe(2);

        first.releaseNext();

        await nextTurn();

        expect(
          first.writes + second.writes,
        ).toBe(3);

        first.releaseNext();
        second.releaseNext();

        await Promise.all([
          firstWrite,
          secondWrite,
          thirdWrite,
        ]);

        await writer.close();

        expect(first.started).toBe(true);
        expect(second.started).toBe(true);
        expect(first.closed).toBe(true);
        expect(second.closed).toBe(true);
      },
    );
  },
);
