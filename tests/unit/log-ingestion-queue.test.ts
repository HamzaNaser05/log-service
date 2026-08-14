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
  
      service: "queue-test",
  
      message:
        `message-${index}`,
  
      attributes: {},
    };
  }
  
  describe(
    "LogIngestionQueue",
    () => {
      test(
        "flushes immediately when the flush threshold is reached",
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
  
                /*
                 * Deliberately long.
                 *
                 * If threshold works,
                 * we should not need
                 * to wait for this.
                 */
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
              "Expected all batches to be accepted",
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
  
          await queue.close();
        },
      );
    },
  );