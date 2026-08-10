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
  
  import { buildServer } from "../../src/http/server.js";
  
  import { insertLogs } from "../../src/persistence/log-repository.js";
  
  import {
    createTestDatabase,
    destroyTestDatabase,
  } from "../helpers/test-database.js";
  
  type TestResources = {
    pool: Pool;
    server: FastifyInstance;
  };
  
  let resources:
    TestResources | undefined;
  
  function getResources(): TestResources {
    if (resources === undefined) {
      throw new Error(
        "Test resources have not been initialized",
      );
    }
  
    return resources;
  }
  
  beforeAll(async () => {
    const pool =
      await createTestDatabase();
  
    const server =
      buildServer(
        pool,
        false,
      );
  
    await server.ready();
  
    resources = {
      pool,
      server,
    };
  });
  
  beforeEach(async () => {
    await getResources().pool.query(
      "TRUNCATE TABLE logs RESTART IDENTITY",
    );
  });
  
  afterAll(async () => {
    if (resources === undefined) {
      return;
    }
  
    await resources.server.close();
  
    await destroyTestDatabase(
      resources.pool,
    );
  
    resources = undefined;
  });
  
  describe(
    "GET /logs",
    () => {
      test(
        "returns logs in deterministic descending order",
        async () => {
          const { pool, server } =
            getResources();
  
          await insertLogs(
            pool,
            [
              {
                timestamp:
                  "2026-08-09T12:00:00Z",
                level: "info",
                service: "query-test",
                message: "first",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T12:02:00Z",
                level: "info",
                service: "query-test",
                message: "third",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T12:01:00Z",
                level: "info",
                service: "query-test",
                message: "second",
                attributes: {},
              },
            ],
          );
  
          const response =
            await server.inject({
              method: "GET",
              url:
                "/logs?service=query-test",
            });
  
          expect(
            response.statusCode,
          ).toBe(200);
  
          const body =
            response.json<{
              logs: Array<{
                message: string;
              }>;
              next_cursor:
                string | null;
            }>();
  
          expect(
            body.logs.map(
              (log) =>
                log.message,
            ),
          ).toEqual([
            "third",
            "second",
            "first",
          ]);
  
          expect(
            body.next_cursor,
          ).toBeNull();
        },
      );
  
      test(
        "paginates same-timestamp logs without duplicates or omissions",
        async () => {
          const { pool, server } =
            getResources();
  
          const timestamp =
            "2026-08-09T15:00:00.123456Z";
  
          await insertLogs(
            pool,
            [
              {
                timestamp,
                level: "info",
                service:
                  "pagination-test",
                message: "one",
                attributes: {},
              },
              {
                timestamp,
                level: "info",
                service:
                  "pagination-test",
                message: "two",
                attributes: {},
              },
              {
                timestamp,
                level: "info",
                service:
                  "pagination-test",
                message: "three",
                attributes: {},
              },
              {
                timestamp,
                level: "info",
                service:
                  "pagination-test",
                message: "four",
                attributes: {},
              },
              {
                timestamp,
                level: "info",
                service:
                  "pagination-test",
                message: "five",
                attributes: {},
              },
            ],
          );
  
          const pageOne =
            await server.inject({
              method: "GET",
              url:
                "/logs?service=pagination-test&limit=2",
            });
  
          expect(
            pageOne.statusCode,
          ).toBe(200);
  
          const bodyOne =
            pageOne.json<{
              logs: Array<{
                id: string;
              }>;
              next_cursor:
                string | null;
            }>();
  
          expect(
            bodyOne.logs.map(
              (log) => log.id,
            ),
          ).toEqual([
            "5",
            "4",
          ]);
  
          expect(
            typeof bodyOne.next_cursor,
          ).toBe("string");
  
          if (
            bodyOne.next_cursor === null
          ) {
            throw new Error(
              "Expected next cursor for page one",
            );
          }
  
          const pageTwo =
            await server.inject({
              method: "GET",
  
              url:
                "/logs?service=pagination-test&limit=2&cursor=" +
                encodeURIComponent(
                  bodyOne.next_cursor,
                ),
            });
  
          const bodyTwo =
            pageTwo.json<{
              logs: Array<{
                id: string;
              }>;
              next_cursor:
                string | null;
            }>();
  
          expect(
            bodyTwo.logs.map(
              (log) => log.id,
            ),
          ).toEqual([
            "3",
            "2",
          ]);
  
          if (
            bodyTwo.next_cursor === null
          ) {
            throw new Error(
              "Expected next cursor for page two",
            );
          }
  
          const pageThree =
            await server.inject({
              method: "GET",
  
              url:
                "/logs?service=pagination-test&limit=2&cursor=" +
                encodeURIComponent(
                  bodyTwo.next_cursor,
                ),
            });
  
          const bodyThree =
            pageThree.json<{
              logs: Array<{
                id: string;
              }>;
              next_cursor:
                string | null;
            }>();
  
          expect(
            bodyThree.logs.map(
              (log) => log.id,
            ),
          ).toEqual([
            "1",
          ]);
  
          expect(
            bodyThree.next_cursor,
          ).toBeNull();
  
          const allIds = [
            ...bodyOne.logs,
            ...bodyTwo.logs,
            ...bodyThree.logs,
          ].map(
            (log) => log.id,
          );
  
          expect(allIds).toEqual([
            "5",
            "4",
            "3",
            "2",
            "1",
          ]);
  
          expect(
            new Set(allIds).size,
          ).toBe(5);
        },
      );
  
      test(
        "returns 400 for an invalid cursor",
        async () => {
          const { server } =
            getResources();
  
          const response =
            await server.inject({
              method: "GET",
              url:
                "/logs?cursor=not*valid",
            });
  
          expect(
            response.statusCode,
          ).toBe(400);
  
          expect(
            response.json(),
          ).toEqual({
            error: "invalid cursor",
          });
        },
      );
    },
  );