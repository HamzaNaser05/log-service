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
  
  import {
    buildServer,
  } from "../../src/http/server.js";
  
  import {
    insertLogs,
  } from "../../src/persistence/log-repository.js";
  
  import {
    createTestDatabase,
    destroyTestDatabase,
  } from "../helpers/test-database.js";
  
  type Resources = {
    pool: Pool;
    server: FastifyInstance;
  };
  
  let resources:
    Resources | undefined;
  
  function getResources(): Resources {
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
      "TRUNCATE TABLE logs, log_minute_rollups RESTART IDENTITY",
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
    "GET /logs/aggregate",
    () => {
      test.each([
        [
          "1m",
          "2026-08-09T09:07:00Z",
        ],
        [
          "5m",
          "2026-08-09T09:05:00Z",
        ],
        [
          "1h",
          "2026-08-09T09:00:00Z",
        ],
        [
          "1d",
          "2026-08-09T00:00:00Z",
        ],
      ])(
        "creates correct %s bucket",
        async (
          bucket,
          expectedStart,
        ) => {
          const {
            pool,
            server,
          } = getResources();
  
          await insertLogs(
            pool,
            [
              {
                timestamp:
                  "2026-08-09T09:07:42Z",
  
                level: "info",
                service:
                  "bucket-test",
  
                message: "test",
  
                attributes: {},
              },
            ],
          );
  
          const response =
            await server.inject({
              method: "GET",
  
              url:
                "/logs/aggregate" +
                "?since=2026-08-09T00%3A00%3A00Z" +
                "&until=2026-08-10T00%3A00%3A00Z" +
                `&bucket=${bucket}`,
            });
  
          expect(
            response.statusCode,
          ).toBe(200);
  
          expect(
            response.json(),
          ).toEqual({
            buckets: [
              {
                start:
                  expectedStart,
  
                group: null,
  
                count: 1,
              },
            ],
          });
        },
      );
  
      test(
        "groups buckets by service",
        async () => {
          const {
            pool,
            server,
          } = getResources();
  
          await insertLogs(
            pool,
            [
              {
                timestamp:
                  "2026-08-09T09:01:00Z",
                level: "info",
                service: "checkout",
                message: "one",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T09:02:00Z",
                level: "error",
                service: "checkout",
                message: "two",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T09:03:00Z",
                level: "warn",
                service: "api",
                message: "three",
                attributes: {},
              },
            ],
          );
  
          const response =
            await server.inject({
              method: "GET",
  
              url:
                "/logs/aggregate" +
                "?since=2026-08-09T09%3A00%3A00Z" +
                "&until=2026-08-09T10%3A00%3A00Z" +
                "&bucket=1h" +
                "&group_by=service",
            });
  
          expect(
            response.statusCode,
          ).toBe(200);
  
          expect(
            response.json(),
          ).toEqual({
            buckets: [
              {
                start:
                  "2026-08-09T09:00:00Z",
                group: "api",
                count: 1,
              },
              {
                start:
                  "2026-08-09T09:00:00Z",
                group: "checkout",
                count: 2,
              },
            ],
          });
        },
      );
  
      test(
        "groups buckets by level",
        async () => {
          const {
            pool,
            server,
          } = getResources();
  
          await insertLogs(
            pool,
            [
              {
                timestamp:
                  "2026-08-09T10:01:00Z",
                level: "error",
                service: "api",
                message: "one",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T10:02:00Z",
                level: "error",
                service: "checkout",
                message: "two",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T10:03:00Z",
                level: "info",
                service: "auth",
                message: "three",
                attributes: {},
              },
            ],
          );
  
          const response =
            await server.inject({
              method: "GET",
  
              url:
                "/logs/aggregate" +
                "?since=2026-08-09T10%3A00%3A00Z" +
                "&until=2026-08-09T11%3A00%3A00Z" +
                "&bucket=1h" +
                "&group_by=level",
            });
  
          expect(
            response.statusCode,
          ).toBe(200);
  
          expect(
            response.json(),
          ).toEqual({
            buckets: [
              {
                start:
                  "2026-08-09T10:00:00Z",
                group: "error",
                count: 2,
              },
              {
                start:
                  "2026-08-09T10:00:00Z",
                group: "info",
                count: 1,
              },
            ],
          });
        },
      );
  
      test(
        "supports combined filters",
        async () => {
          const {
            pool,
            server,
          } = getResources();
  
          await insertLogs(
            pool,
            [
              {
                timestamp:
                  "2026-08-09T09:01:00Z",
  
                level: "error",
  
                service:
                  "checkout",
  
                message:
                  "Payment declined",
  
                attributes: {
                  region:
                    "eu-west",
                },
              },
  
              {
                timestamp:
                  "2026-08-09T09:02:00Z",
  
                level: "error",
  
                service:
                  "checkout",
  
                message:
                  "Payment declined",
  
                attributes: {
                  region:
                    "us-east",
                },
              },
            ],
          );
  
          const response =
            await server.inject({
              method: "GET",
  
              url:
                "/logs/aggregate" +
                "?since=2026-08-09T09%3A00%3A00Z" +
                "&until=2026-08-09T10%3A00%3A00Z" +
                "&bucket=1h" +
                "&service=checkout" +
                "&level=error" +
                "&attr.region=eu-west" +
                "&q=PAYMENT",
            });
  
          expect(
            response.statusCode,
          ).toBe(200);
  
          expect(
            response.json(),
          ).toEqual({
            buckets: [
              {
                start:
                  "2026-08-09T09:00:00Z",
                group: null,
                count: 1,
              },
            ],
          });
        },
      );
  
      test(
        "returns an empty array for an empty range",
        async () => {
          const { server } =
            getResources();
  
          const response =
            await server.inject({
              method: "GET",
  
              url:
                "/logs/aggregate" +
                "?since=2026-08-09T09%3A00%3A00Z" +
                "&until=2026-08-09T09%3A00%3A00Z" +
                "&bucket=1h",
            });
  
          expect(
            response.statusCode,
          ).toBe(200);
  
          expect(
            response.json(),
          ).toEqual({
            buckets: [],
          });
        },
      );

      test(
        "combines rollups with exact partial-minute boundaries",
        async () => {
          const {
            pool,
            server,
          } = getResources();

          await insertLogs(
            pool,
            [
              {
                timestamp:
                  "2026-08-09T09:00:10Z",
                level: "info",
                service: "edge-test",
                message: "excluded before since",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T09:00:30Z",
                level: "info",
                service: "edge-test",
                message: "included first edge",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T09:01:10Z",
                level: "info",
                service: "edge-test",
                message: "included rollup",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T09:02:10Z",
                level: "info",
                service: "edge-test",
                message: "included last edge",
                attributes: {},
              },
              {
                timestamp:
                  "2026-08-09T09:02:30Z",
                level: "info",
                service: "edge-test",
                message: "excluded after until",
                attributes: {},
              },
            ],
          );

          const response =
            await server.inject({
              method: "GET",
              url:
                "/logs/aggregate" +
                "?since=2026-08-09T09%3A00%3A20Z" +
                "&until=2026-08-09T09%3A02%3A20Z" +
                "&bucket=1m" +
                "&service=edge-test",
            });

          expect(
            response.statusCode,
          ).toBe(200);

          expect(
            response.json(),
          ).toEqual({
            buckets: [
              {
                start:
                  "2026-08-09T09:00:00Z",
                group: null,
                count: 1,
              },
              {
                start:
                  "2026-08-09T09:01:00Z",
                group: null,
                count: 1,
              },
              {
                start:
                  "2026-08-09T09:02:00Z",
                group: null,
                count: 1,
              },
            ],
          });
        },
      );
  
      test(
        "returns 400 for an invalid bucket",
        async () => {
          const { server } =
            getResources();
  
          const response =
            await server.inject({
              method: "GET",
  
              url:
                "/logs/aggregate" +
                "?since=2026-08-09T09%3A00%3A00Z" +
                "&until=2026-08-09T10%3A00%3A00Z" +
                "&bucket=2h",
            });
  
          expect(
            response.statusCode,
          ).toBe(400);
        },
      );
    },
  );
