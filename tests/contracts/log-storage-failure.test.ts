import type {
    FastifyInstance,
  } from "fastify";
  
  import type {
    Pool,
  } from "pg";
  
  import {
    afterAll,
    beforeAll,
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
  
  import type {
    LogBatchWriter,
  } from "../../src/ingestion/log-batch-writer.js";
  
  import {
    LogIngestionQueue,
  } from "../../src/ingestion/log-ingestion-queue.js";
  
  import {
    createTestDatabase,
    destroyTestDatabase,
  } from "../helpers/test-database.js";
  
  class FailingWriter
  implements LogBatchWriter {
    public async start():
      Promise<void> {}
  
    public async write(
      _logs:
        readonly ValidatedLogEntry[],
    ): Promise<void> {
      throw new Error(
        "SUPER_SECRET_DATABASE_INTERNAL_ERROR",
      );
    }
  
    public async close():
      Promise<void> {}
  }
  
  let pool:
    Pool | undefined;
  
  let server:
    FastifyInstance | undefined;
  
  function getPool():
    Pool {
    if (pool === undefined) {
      throw new Error(
        "Test database is not initialized",
      );
    }
  
    return pool;
  }
  
  function getServer():
    FastifyInstance {
    if (server === undefined) {
      throw new Error(
        "Test server is not initialized",
      );
    }
  
    return server;
  }
  
  beforeAll(
    async () => {
      pool =
        await createTestDatabase();
  
      const queue =
        new LogIngestionQueue(
          new FailingWriter(),
          {
            maxBufferedLogs: 10,
  
            maxMicrobatchLogs: 10,
  
            flushThresholdLogs: 1,
  
            maxWaitMilliseconds: 1,
  
            retryAfterSeconds: 1,
          },
        );
  
      await queue.start();
  
      server =
        buildServer(
          pool,
          false,
          queue,
        );
  
      await server.ready();
    },
  );
  
  afterAll(
    async () => {
      if (server !== undefined) {
        await server.close();
  
        server = undefined;
      }
  
      if (pool !== undefined) {
        const testPool =
          pool;
  
        pool = undefined;
  
        await destroyTestDatabase(
          testPool,
        );
      }
    },
  );
  
  describe(
    "POST /logs storage failure",
    () => {
      test(
        "returns 503 and never reports success when durable storage fails",
        async () => {
          const response =
            await getServer()
              .inject({
                method: "POST",
  
                url: "/logs",
  
                payload: {
                  logs: [
                    {
                      timestamp:
                        "2026-08-09T12:00:00Z",
  
                      level:
                        "error",
  
                      service:
                        "failure-test",
  
                      message:
                        "should never report success",
  
                      attributes: {
                        region:
                          "eu-west",
                      },
                    },
                  ],
                },
              });
  
          expect(
            response.statusCode,
          ).toBe(503);
  
          expect(
            response.json(),
          ).toEqual({
            error:
              "log ingestion unavailable",
          });
        },
      );
  
      test(
        "does not expose internal storage errors to clients",
        async () => {
          const response =
            await getServer()
              .inject({
                method: "POST",
  
                url: "/logs",
  
                payload: {
                  logs: [
                    {
                      timestamp:
                        "2026-08-09T12:01:00Z",
  
                      level:
                        "info",
  
                      service:
                        "failure-test",
  
                      message:
                        "secret error test",
  
                      attributes: {},
                    },
                  ],
                },
              });
  
          expect(
            response.statusCode,
          ).toBe(503);
  
          expect(
            response.body,
          ).not.toContain(
            "SUPER_SECRET_DATABASE_INTERNAL_ERROR",
          );
  
          expect(
            response.body
              .toLowerCase(),
          ).not.toContain(
            "postgres",
          );
        },
      );
  
      test(
        "failed ingestion does not create database rows",
        async () => {
          const result =
            await getPool()
              .query<{
                count: string;
              }>(
                `
                  SELECT count(*)
                  FROM logs
                  WHERE service =
                    'failure-test'
                `,
              );
  
          expect(
            result.rows[0]?.count,
          ).toBe("0");
        },
      );
    },
  );