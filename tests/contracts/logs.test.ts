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
  
  import {
    createTestDatabase,
    destroyTestDatabase,
  } from "../helpers/test-database.js";
  
  type TestResources = {
    pool: Pool;
    server: FastifyInstance;
  };
  
  let resources: TestResources | undefined;
  
  function getResources(): TestResources {
    if (resources === undefined) {
      throw new Error(
        "Test resources have not been initialized",
      );
    }
  
    return resources;
  }
  
  beforeAll(async () => {
    const pool = await createTestDatabase();
  
    const server = buildServer(
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
    const { pool } = getResources();
  
    await pool.query(
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
  
  describe("POST /logs", () => {
    test(
      "commits a valid log",
      async () => {
        const { server, pool } =
          getResources();
  
        const response =
          await server.inject({
            method: "POST",
            url: "/logs",
            payload: {
              logs: [
                {
                  timestamp:
                    "2026-08-09T12:00:00Z",
                  level: "error",
                  service: "checkout",
                  message:
                    "payment declined",
                  attributes: {
                    user_id: "42",
                    retries: 3,
                    premium: true,
                  },
                },
              ],
            },
          });
  
        expect(response.statusCode).toBe(200);
  
        expect(response.json()).toEqual({
          accepted: 1,
          rejected: [],
        });
  
        const result =
          await pool.query<{
            level: string;
            service: string;
            message: string;
            attributes: unknown;
          }>(
            `
              SELECT
                level,
                service,
                message,
                attributes
              FROM logs
            `,
          );
  
        expect(result.rowCount).toBe(1);
  
        expect(result.rows[0]).toEqual({
          level: "error",
          service: "checkout",
          message: "payment declined",
          attributes: {
            user_id: "42",
            retries: 3,
            premium: true,
          },
        });
      },
    );
  
    test(
      "accepts valid siblings and rejects invalid entries",
      async () => {
        const { server, pool } =
          getResources();
  
        const response =
          await server.inject({
            method: "POST",
            url: "/logs",
            payload: {
              logs: [
                {
                  timestamp:
                    "2026-08-09T13:00:00Z",
                  level: "info",
                  service: "auth",
                  message: "login successful",
                },
                {
                  timestamp:
                    "2026-08-09T13:00:01Z",
                  level: "critical",
                  service: "auth",
                  message: "bad level",
                },
                {
                  timestamp:
                    "2026-08-09T13:00:02Z",
                  level: "warn",
                  service: "api",
                  message: "slow request",
                },
              ],
            },
          });
  
        expect(response.statusCode).toBe(200);
  
        expect(response.json()).toEqual({
          accepted: 2,
          rejected: [
            {
              index: 1,
              reason:
                "invalid level: 'critical'",
            },
          ],
        });
  
        const result =
          await pool.query<{
            service: string;
          }>(
            `
              SELECT service
              FROM logs
              ORDER BY timestamp
            `,
          );
  
        expect(
          result.rows.map(
            (row) => row.service,
          ),
        ).toEqual([
          "auth",
          "api",
        ]);
      },
    );
  
    test(
      "returns 400 when all entries are invalid",
      async () => {
        const { server, pool } =
          getResources();
  
        const response =
          await server.inject({
            method: "POST",
            url: "/logs",
            payload: {
              logs: [
                {
                  timestamp:
                    "2026-08-09T14:00:00Z",
                  level: "critical",
                  service: "api",
                  message: "bad",
                },
              ],
            },
          });
  
        expect(response.statusCode).toBe(400);
  
        expect(response.json()).toEqual({
          accepted: 0,
          rejected: [
            {
              index: 0,
              reason:
                "invalid level: 'critical'",
            },
          ],
        });
  
        const result =
          await pool.query<{
            count: string;
          }>(
            "SELECT count(*) FROM logs",
          );
  
        expect(result.rows[0]?.count).toBe(
          "0",
        );
      },
    );
  
    test(
      "returns 400 for an empty batch",
      async () => {
        const { server } =
          getResources();
  
        const response =
          await server.inject({
            method: "POST",
            url: "/logs",
            payload: {
              logs: [],
            },
          });
  
        expect(response.statusCode).toBe(400);
  
        expect(response.json()).toEqual({
          error:
            "logs must contain at least one entry",
        });
      },
    );
  
    test(
      "returns 400 when logs is not an array",
      async () => {
        const { server } =
          getResources();
  
        const response =
          await server.inject({
            method: "POST",
            url: "/logs",
            payload: {
              logs: "invalid",
            },
          });
  
        expect(response.statusCode).toBe(400);
  
        expect(response.json()).toEqual({
          error: "logs must be an array",
        });
      },
    );
  
    test(
      "returns 400 for malformed JSON",
      async () => {
        const { server } =
          getResources();
  
        const response =
          await server.inject({
            method: "POST",
            url: "/logs",
            headers: {
              "content-type":
                "application/json",
            },
            payload: '{"logs": [',
          });
  
        expect(response.statusCode).toBe(400);
      },
    );
  
    test(
      "rejects nested attributes without rejecting valid siblings",
      async () => {
        const { server, pool } =
          getResources();
  
        const response =
          await server.inject({
            method: "POST",
            url: "/logs",
            payload: {
              logs: [
                {
                  timestamp:
                    "2026-08-09T15:00:00Z",
                  level: "info",
                  service: "api",
                  message: "valid",
                  attributes: {
                    duration_ms: 50,
                  },
                },
                {
                  timestamp:
                    "2026-08-09T15:00:01Z",
                  level: "info",
                  service: "api",
                  message:
                    "nested attributes",
                  attributes: {
                    user: {
                      id: 42,
                    },
                  },
                },
              ],
            },
          });
  
        expect(response.statusCode).toBe(200);
  
        expect(response.json()).toEqual({
          accepted: 1,
          rejected: [
            {
              index: 1,
              reason:
                "invalid attribute 'user': values must be strings, numbers, or booleans",
            },
          ],
        });
  
        const result =
          await pool.query<{
            count: string;
          }>(
            "SELECT count(*) FROM logs",
          );
  
        expect(result.rows[0]?.count).toBe(
          "1",
        );
      },
    );
  
    test(
      "rolls back the entire accepted transaction when one insert fails",
      async () => {
        const { server, pool } =
          getResources();
  
        const response =
          await server.inject({
            method: "POST",
            url: "/logs",
            payload: {
              logs: [
                {
                  timestamp:
                    "2026-08-09T16:00:00Z",
                  level: "info",
                  service:
                    "rollback-test",
                  message:
                    "valid partition",
                },
                {
                  timestamp:
                    "2026-08-08T16:00:00Z",
                  level: "info",
                  service:
                    "rollback-test",
                  message:
                    "missing partition",
                },
              ],
            },
          });
  
        expect(response.statusCode).toBe(503);
  
        expect(response.json()).toEqual({
          error:
            "log ingestion unavailable",
        });
  
        const result =
          await pool.query<{
            count: string;
          }>(
            `
              SELECT count(*)
              FROM logs
              WHERE service =
                'rollback-test'
            `,
          );
  
        expect(result.rows[0]?.count).toBe(
          "0",
        );
      },
    );
  });