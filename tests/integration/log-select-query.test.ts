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
  
  import { insertLogs } from "../../src/persistence/log-repository.js";
  
  import {
    buildLogSelectQuery,
  } from "../../src/query/log-select-query.js";
  
  import {
    createTestDatabase,
    destroyTestDatabase,
  } from "../helpers/test-database.js";
  
  let pool: Pool | undefined;
  
  function getPool(): Pool {
    if (pool === undefined) {
      throw new Error(
        "Test database has not been initialized",
      );
    }
  
    return pool;
  }
  
  beforeAll(async () => {
    pool = await createTestDatabase();
  });
  
  beforeEach(async () => {
    await getPool().query(
      "TRUNCATE TABLE logs, log_second_rollups RESTART IDENTITY",
    );
  });
  
  afterAll(async () => {
    if (pool === undefined) {
      return;
    }
  
    const testPool = pool;
  
    pool = undefined;
  
    await destroyTestDatabase(
      testPool,
    );
  });
  
  describe(
    "log select query",
    () => {
      test(
        "executes freely combined filters",
        async () => {
          const testPool =
            getPool();
  
          await insertLogs(
            testPool,
            [
              {
                timestamp:
                  "2026-08-09T10:00:00Z",
                level: "error",
                service: "checkout",
                message:
                  "Payment declined for user",
                attributes: {
                  region: "eu-west",
                  retries: 3,
                },
              },
  
              {
                timestamp:
                  "2026-08-09T10:01:00Z",
                level: "error",
                service: "checkout",
                message:
                  "Payment declined for user",
                attributes: {
                  region: "us-east",
                  retries: 3,
                },
              },
  
              {
                timestamp:
                  "2026-08-09T10:02:00Z",
                level: "info",
                service: "checkout",
                message:
                  "Payment completed",
                attributes: {
                  region: "eu-west",
                  retries: 3,
                },
              },
            ],
          );
  
          const query =
            buildLogSelectQuery({
              service: "checkout",
              level: "error",
  
              since:
                "2026-08-09T09:00:00Z",
  
              until:
                "2026-08-09T11:00:00Z",
  
              attributeFilters: [
                {
                  key: "region",
                  value: "eu-west",
                },
                {
                  key: "retries",
                  value: "3",
                },
              ],
  
              q: "PAYMENT declined",
  
              limit: 100,
  
              cursor: null,
            });
  
          const result =
            await testPool.query<{
              service: string;
              message: string;
            }>(
              query.text,
              query.values,
            );
  
          expect(result.rowCount).toBe(1);
  
          expect(result.rows[0]).toMatchObject({
            service: "checkout",
            message:
              "Payment declined for user",
          });
        },
      );
  
      test(
        "treats percent underscore and backslash as literal search text",
        async () => {
          const testPool =
            getPool();
  
          await insertLogs(
            testPool,
            [
              {
                timestamp:
                  "2026-08-09T11:00:00Z",
                level: "info",
                service: "literal-search",
                message:
                  String.raw`literal 100%_\match value`,
                attributes: {},
              },
  
              {
                timestamp:
                  "2026-08-09T11:01:00Z",
                level: "info",
                service: "literal-search",
                message:
                  "literal 100XYZmatch value",
                attributes: {},
              },
            ],
          );
  
          const query =
            buildLogSelectQuery({
              service:
                "literal-search",
  
              level: null,
              since: null,
              until: null,
              attributeFilters: [],
  
              q:
                String.raw`100%_\match`,
  
              limit: 100,
              cursor: null,
            });
  
          const result =
            await testPool.query<{
              message: string;
            }>(
              query.text,
              query.values,
            );
  
          expect(result.rowCount).toBe(1);
  
          expect(
            result.rows[0]?.message,
          ).toBe(
            String.raw`literal 100%_\match value`,
          );
        },
      );

      test(
        "queries string number and boolean attributes through normalized JSONB",
        async () => {
          const testPool =
            getPool();
      
          await insertLogs(
            testPool,
            [
              {
                timestamp:
                  "2026-08-09T12:00:00Z",
      
                level: "info",
      
                service:
                  "normalized-test",
      
                message:
                  "attribute test",
      
                attributes: {
                  user_id: "42",
                  retries: 3,
                  premium: true,
                },
              },
            ],
          );
      
          const query =
            buildLogSelectQuery({
              service:
                "normalized-test",
      
              level: null,
      
              since: null,
              until: null,
      
              attributeFilters: [
                {
                  key: "user_id",
                  value: "42",
                },
                {
                  key: "retries",
                  value: "3",
                },
                {
                  key: "premium",
                  value: "true",
                },
              ],
      
              q: null,
      
              limit: 100,
      
              cursor: null,
            });
      
          const result =
            await testPool.query<{
              attributes: unknown;
            }>(
              query.text,
              query.values,
            );
      
          expect(
            result.rowCount,
          ).toBe(1);
      
          expect(
            result.rows[0]
              ?.attributes,
          ).toEqual({
            user_id: "42",
            retries: 3,
            premium: true,
          });
        },
      );
    },
  );
