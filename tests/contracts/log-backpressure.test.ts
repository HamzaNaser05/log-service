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
    IngestionAdmissionController,
  } from "../../src/ingestion/admission-controller.js";
  
  import {
    createTestDatabase,
    destroyTestDatabase,
  } from "../helpers/test-database.js";
  
  type Resources = {
    pool: Pool;
  
    server:
      FastifyInstance;
  
    controller:
      IngestionAdmissionController;
  };
  
  let resources:
    Resources | undefined;
  
  function getResources():
    Resources {
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
  
      const controller =
        new IngestionAdmissionController(
          1,
          7,
        );
  
      const server =
        buildServer(
          pool,
          false,
          controller,
        );
  
      await server.ready();
  
      resources = {
        pool,
        server,
        controller,
      };
    },
  );
  
  beforeEach(
    async () => {
      await getResources()
        .pool
        .query(
          "TRUNCATE TABLE logs RESTART IDENTITY",
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
        "returns 503 and Retry-After when ingestion capacity is full",
        async () => {
          const {
            pool,
            server,
            controller,
          } =
            getResources();
  
          /*
           * Occupy the only slot
           * without performing a
           * request.
           */
          const blocker =
            controller
              .tryAcquire();
  
          if (
            blocker === null
          ) {
            throw new Error(
              "Expected admission permit",
            );
          }
  
          try {
            const response =
              await server.inject({
                method: "POST",
  
                url: "/logs",
  
                payload: {
                  logs: [
                    {
                      timestamp:
                        "2026-08-09T18:00:00Z",
  
                      level:
                        "info",
  
                      service:
                        "backpressure-test",
  
                      message:
                        "should be rejected while busy",
  
                      attributes:
                        {},
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
  
            const result =
              await pool.query<{
                count:
                  string;
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
          } finally {
            blocker.release();
          }
  
          /*
           * Once capacity becomes
           * available, the same kind
           * of request can succeed.
           */
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
                      "capacity available",
  
                    attributes:
                      {},
                  },
                ],
              },
            });
  
          expect(
            response.statusCode,
          ).toBe(200);
        },
      );
    },
  );