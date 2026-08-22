import type {
  FastifyInstance,
} from "fastify";

import type {
  Pool,
} from "pg";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import type {
  ValidatedLogEntry,
} from "../../src/domain/log.js";

import {
  buildServer,
} from "../../src/http/server.js";

import {
  LogIngestionQueue,
} from "../../src/ingestion/log-ingestion-queue.js";

import type {
  LogBatchWriter,
} from "../../src/ingestion/log-batch-writer.js";

import {
  createTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-database.js";

class BlockingWriter
  implements LogBatchWriter {
  private releaseWrite:
    (() => void) | null =
    null;

  private readonly writeStarted:
    Promise<void>;

  private resolveWriteStarted:
    (() => void) | null =
    null;

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
    Promise<void> {
    // No real database writer
    // connection is needed for
    // this contract test.
  }

  public async write(
    _logs:
      readonly ValidatedLogEntry[],
  ): Promise<void> {
    /*
     * Tell the test that the queue
     * has moved the batch from
     * queued -> in-flight.
     */
    this.resolveWriteStarted?.();

    this.resolveWriteStarted =
      null;

    /*
     * Keep the write in-flight
     * until the test explicitly
     * releases it.
     */
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

  public unblock(): void {
    this.releaseWrite?.();

    this.releaseWrite =
      null;
  }

  public async close():
    Promise<void> {
    this.unblock();
  }
}

type TestResources = {
  pool: Pool;

  server: FastifyInstance;

  queue: LogIngestionQueue;

  writer: BlockingWriter;
};

let resources:
  TestResources | undefined;

function getResources():
  TestResources {
  if (
    resources === undefined
  ) {
    throw new Error(
      "Test resources have not been initialized",
    );
  }

  return resources;
}

beforeAll(
  async () => {
    const pool =
      await createTestDatabase();

    const writer =
      new BlockingWriter();

    /*
     * Only one log may exist in
     * queued + in-flight state.
     *
     * Once that slot is occupied,
     * another POST /logs must
     * receive backpressure.
     */
    const queue =
      new LogIngestionQueue(
        writer,
        {
          maxBufferedLogs: 1,

          maxMicrobatchLogs: 1,

          maxWaitMilliseconds: 1,

          flushThresholdLogs: 1,

          retryAfterSeconds: 7,
        },
      );

    await queue.start();

    const server =
      buildServer(
        pool,
        false,
        queue,
      );

    await server.ready();

    resources = {
      pool,
      server,
      queue,
      writer,
    };
  },
);

beforeEach(
  async () => {
    const {
      pool,
    } = getResources();

    await pool.query(
      "TRUNCATE TABLE logs, log_second_rollups RESTART IDENTITY",
    );
  },
);

afterAll(
  async () => {
    if (
      resources === undefined
    ) {
      return;
    }

    /*
     * server.close() also triggers
     * the Fastify onClose hook,
     * which drains/closes the
     * ingestion queue.
     */
    await resources
      .server
      .close();

    await destroyTestDatabase(
      resources.pool,
    );

    resources =
      undefined;
  },
);

describe(
  "POST /logs backpressure",
  () => {
    test(
      "returns 503 and Retry-After when the ingestion queue is full",
      async () => {
        const {
          pool,
          server,
          queue,
          writer,
        } =
          getResources();

        /*
         * Occupy the queue's only
         * available log slot.
         *
         * The fake writer blocks,
         * so this log remains
         * in-flight.
         */
        const blocker =
          queue.enqueue([
            {
              timestamp:
                "2026-08-09T18:00:00Z",

              level:
                "info",

              service:
                "internal-blocker",

              message:
                "hold ingestion capacity",

              attributes: {},
            },
          ]);

        expect(
          blocker.ok,
        ).toBe(true);

        if (!blocker.ok) {
          throw new Error(
            "Expected blocker batch to enter ingestion queue",
          );
        }

        /*
         * Don't use an arbitrary
         * sleep here.
         *
         * Wait until the fake writer
         * confirms that the blocker
         * is actually in-flight.
         */
        await writer
          .waitUntilWriteStarts();

        expect(
          queue.bufferedLogCount,
        ).toBe(1);

        try {
          const response =
            await server.inject({
              method: "POST",

              url: "/logs",

              payload: {
                logs: [
                  {
                    timestamp:
                      "2026-08-09T18:01:00Z",

                    level:
                      "info",

                    service:
                      "backpressure-test",

                    message:
                      "should not enter a full ingestion queue",

                    attributes: {},
                  },
                ],
              },
            });

          expect(
            response.statusCode,
          ).toBe(503);

          expect(
            response.headers[
            "retry-after"
            ],
          ).toBe("7");

          expect(
            response.json(),
          ).toEqual({
            error:
              "log ingestion busy",
          });

          /*
           * The rejected HTTP request
           * must never reach durable
           * storage.
           */
          const result =
            await pool.query<{
              count: string;
            }>(
              `
                SELECT count(*)
                FROM logs
                WHERE service =
                  'backpressure-test'
              `,
            );

          expect(
            result.rows[0]
              ?.count,
          ).toBe("0");

          /*
           * Capacity remains occupied
           * by the blocker until we
           * explicitly release it.
           */
          expect(
            queue.bufferedLogCount,
          ).toBe(1);
        } finally {
          /*
           * Always unblock the fake
           * writer even if an
           * assertion fails.
           *
           * Otherwise server.close()
           * would correctly wait for
           * the in-flight write
           * forever.
           */
          writer.unblock();

          await blocker
            .completion;
        }

        expect(
          queue.bufferedLogCount,
        ).toBe(0);
      },
    );
  },
);
