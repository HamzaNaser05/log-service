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
  
  import {
    buildServer,
  } from "../../src/http/server.js";
  
  import {
    createTestDatabase,
    destroyTestDatabase,
  } from "../helpers/test-database.js";
  
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
  
      server =
        buildServer(
          pool,
          false,
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
    "HTTP edge cases",
    () => {
      test(
        "returns 400 for malformed JSON",
        async () => {
          const response =
            await getServer()
              .inject({
                method: "POST",
  
                url: "/logs",
  
                headers: {
                  "content-type":
                    "application/json",
                },
  
                payload:
                  '{"logs": [',
              });
  
          expect(
            response.statusCode,
          ).toBe(400);
        },
      );
  
      test(
        "returns 400 for a corrupted cursor",
        async () => {
          /*
           * Base64URL representation of
           * an unsupported/incomplete
           * cursor object.
           */
          const invalidCursor =
            "eyJ2Ijo5OX0";
  
          const response =
            await getServer()
              .inject({
                method: "GET",
  
                url:
                  `/logs?cursor=${invalidCursor}`,
              });
  
          expect(
            response.statusCode,
          ).toBe(400);
  
          expect(
            response.json(),
          ).toEqual({
            error:
              "invalid cursor",
          });
        },
      );
  
      test(
        "malformed requests do not create logs",
        async () => {
          const before =
            await getPool()
              .query<{
                count: string;
              }>(
                "SELECT count(*) FROM logs",
              );
  
          await getServer()
            .inject({
              method: "POST",
  
              url: "/logs",
  
              headers: {
                "content-type":
                  "application/json",
              },
  
              payload:
                '{"logs":',
            });
  
          const after =
            await getPool()
              .query<{
                count: string;
              }>(
                "SELECT count(*) FROM logs",
              );
  
          expect(
            after.rows[0]?.count,
          ).toBe(
            before.rows[0]?.count,
          );
        },
      );
    },
  );