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
    LogIngestionQueue,
  } from "../../src/ingestion/log-ingestion-queue.js";
  
  function createLog(
    index: number,
  ): ValidatedLogEntry {
    return {
      timestamp:
        `2026-08-09T12:00:${String(
          index,
        ).padStart(
          2,
          "0",
        )}.000Z`,
  
      level: "info",
  
      service:
        "queue-test",
  
      message:
        `message-${index}`,
  
      attributes: {
        index,
      },
    };
  }
  
  
  class RecordingWriter
  implements LogBatchWriter {
    public readonly batches:
      number[] = [];
  
    public async start():
      Promise<void> {}
  
    public async write(
      logs:
        readonly ValidatedLogEntry[],
    ): Promise<void> {
      this.batches.push(
        logs.length,
      );
    }
  
    public async close():
      Promise<void> {}
  }
  
  
  class FailingWriter
  implements LogBatchWriter {
    public async start():
      Promise<void> {}
  
    public async write(
      _logs:
        readonly ValidatedLogEntry[],
    ): Promise<void> {
      throw new Error(
        "writer failed",
      );
    }
  
    public async close():
      Promise<void> {}
  }
  
  
  class ControlledWriter
  implements LogBatchWriter {
    private releaseWrite:
      (() => void) | null =
        null;
  
    private resolveWriteStarted:
      (() => void) | null =
        null;
  
    private readonly writeStarted:
      Promise<void>;
  
    public constructor() {
      this.writeStarted =
        new Promise<void>(
          (resolve) => {
            this.resolveWriteStarted =
              resolve;
          },
        );
    }
  
    public async start():
      Promise<void> {}
  
    public async write(
      _logs:
        readonly ValidatedLogEntry[],
    ): Promise<void> {
      this.resolveWriteStarted?.();
  
      this.resolveWriteStarted =
        null;
  
      await new Promise<void>(
        (resolve) => {
          this.releaseWrite =
            resolve;
        },
      );
    }
  
    public waitUntilWriteStarts():
      Promise<void> {
      return this.writeStarted;
    }
  
    public release(): void {
      this.releaseWrite?.();
  
      this.releaseWrite =
        null;
    }
  
    public async close():
      Promise<void> {
      this.release();
    }
  }
  
  
  describe(
    "LogIngestionQueue",
    () => {
      test(
        "groups requests into one microbatch when the flush threshold is reached",
        async () => {
          const writer =
            new RecordingWriter();
  
          const queue =
            new LogIngestionQueue(
              writer,
              {
                maxBufferedLogs: 10,
  
                maxMicrobatchLogs: 10,
  
                flushThresholdLogs: 4,
  
                maxWaitMilliseconds:
                  1000,
  
                retryAfterSeconds: 1,
              },
            );
  
          await queue.start();
  
          const first =
            queue.enqueue([
              createLog(1),
            ]);
  
          const second =
            queue.enqueue([
              createLog(2),
            ]);
  
          const third =
            queue.enqueue([
              createLog(3),
            ]);
  
          expect(
            writer.batches,
          ).toEqual([]);
  
          const fourth =
            queue.enqueue([
              createLog(4),
            ]);
  
          if (
            !first.ok ||
            !second.ok ||
            !third.ok ||
            !fourth.ok
          ) {
            throw new Error(
              "Expected all requests to be accepted",
            );
          }
  
          await Promise.all([
            first.completion,
            second.completion,
            third.completion,
            fourth.completion,
          ]);
  
          expect(
            writer.batches,
          ).toEqual([
            4,
          ]);
  
          expect(
            queue.bufferedLogCount,
          ).toBe(0);
  
          await queue.close();
        },
      );
  
  
      test(
        "rejects every request in a failed microbatch",
        async () => {
          const queue =
            new LogIngestionQueue(
              new FailingWriter(),
              {
                maxBufferedLogs: 10,
  
                maxMicrobatchLogs: 10,
  
                flushThresholdLogs: 2,
  
                maxWaitMilliseconds:
                  1000,
  
                retryAfterSeconds: 1,
              },
            );
  
          await queue.start();
  
          const first =
            queue.enqueue([
              createLog(1),
            ]);
  
          const second =
            queue.enqueue([
              createLog(2),
            ]);
  
          if (
            !first.ok ||
            !second.ok
          ) {
            throw new Error(
              "Expected requests to enter queue",
            );
          }
  
          await expect(
            first.completion,
          ).rejects.toThrow(
            "writer failed",
          );
  
          await expect(
            second.completion,
          ).rejects.toThrow(
            "writer failed",
          );
  
          expect(
            queue.bufferedLogCount,
          ).toBe(0);
  
          await queue.close();
        },
      );
  
  
      test(
        "close drains in-flight work before the writer is released",
        async () => {
          const writer =
            new ControlledWriter();
  
          const queue =
            new LogIngestionQueue(
              writer,
              {
                maxBufferedLogs: 10,
  
                maxMicrobatchLogs: 10,
  
                flushThresholdLogs: 10,
  
                maxWaitMilliseconds:
                  1000,
  
                retryAfterSeconds: 1,
              },
            );
  
          await queue.start();
  
          const request =
            queue.enqueue([
              createLog(1),
            ]);
  
          if (!request.ok) {
            throw new Error(
              "Expected request to enter queue",
            );
          }
  
          let closeCompleted =
            false;
  
          const closePromise =
            queue.close()
              .then(() => {
                closeCompleted =
                  true;
              });
  
          /*
           * close() should force the
           * queued batch to start
           * immediately rather than
           * waiting for the normal
           * timer.
           */
          await writer
            .waitUntilWriteStarts();
  
          expect(
            closeCompleted,
          ).toBe(false);
  
          expect(
            queue.bufferedLogCount,
          ).toBe(1);
  
          const afterClose =
            queue.enqueue([
              createLog(2),
            ]);
  
          expect(
            afterClose,
          ).toEqual({
            ok: false,
            reason: "closed",
          });
  
          writer.release();
  
          await request.completion;
  
          await closePromise;
  
          expect(
            closeCompleted,
          ).toBe(true);
  
          expect(
            queue.bufferedLogCount,
          ).toBe(0);
        },
      );
    },
  );