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
    BinaryCopyLogWriter,
  } from "../../src/ingestion/binary-copy-writer.js";
  
  import {
    createTestDatabase,
    destroyTestDatabase,
  } from "../helpers/test-database.js";
  
  let pool:
    Pool | undefined;
  
  let writer:
    BinaryCopyLogWriter | undefined;
  
  function getPool():
    Pool {
    if (
      pool === undefined
    ) {
      throw new Error(
        "Test database is not initialized",
      );
    }
  
    return pool;
  }
  
  beforeAll(
    async () => {
      pool =
        await createTestDatabase();
  
      writer =
        new BinaryCopyLogWriter(
          pool,
        );
  
      await writer.start();
    },
  );
  
  beforeEach(
    async () => {
      await getPool().query(
        "TRUNCATE TABLE logs RESTART IDENTITY",
      );
    },
  );
  
  afterAll(
    async () => {
      if (
        writer !== undefined
      ) {
        await writer.close();
      }
  
      if (
        pool !== undefined
      ) {
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
    "BinaryCopyLogWriter",
    () => {
      test(
        "copies logs without losing timestamp or attribute types",
        async () => {
          if (
            writer === undefined
          ) {
            throw new Error(
              "Writer is not initialized",
            );
          }
  
          await writer.write([
            {
              timestamp:
                "2026-08-09T12:34:56.123456Z",
  
              level: "error",
  
              service:
                "binary-copy-test",
  
              message:
                "مرحبا 🔥 payment declined",
  
              attributes: {
                user_id: "42",
                retries: 3,
                premium: true,
              },
            },
          ]);
  
          const result =
            await getPool().query<{
              id: string;
  
              timestamp:
                string;
  
              level: string;
  
              service: string;
  
              message: string;
  
              attributes: unknown;
  
              attributes_normalized:
                unknown;
            }>(
              `
                SELECT
                  id,
  
                  to_char(
                    timestamp
                      AT TIME ZONE 'UTC',
  
                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                  ) AS timestamp,
  
                  level,
                  service,
                  message,
                  attributes,
                  attributes_normalized
  
                FROM logs
              `,
            );
  
          expect(
            result.rowCount,
          ).toBe(1);
  
          expect(
            result.rows[0],
          ).toEqual({
            id: "1",
  
            timestamp:
              "2026-08-09T12:34:56.123456Z",
  
            level: "error",
  
            service:
              "binary-copy-test",
  
            message:
              "مرحبا 🔥 payment declined",
  
            attributes: {
              user_id: "42",
              retries: 3,
              premium: true,
            },
  
            attributes_normalized:
              {
                user_id: "42",
                retries: "3",
                premium: "true",
              },
          });
        },
      );
    },
  );