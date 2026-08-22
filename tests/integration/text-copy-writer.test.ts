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
  TextCopyLogWriter,
} from "../../src/ingestion/text-copy-writer.js";

import {
  createTestDatabase,
  destroyTestDatabase,
} from "../helpers/test-database.js";

let pool:
  Pool | undefined;

let writer:
  TextCopyLogWriter | undefined;

function getPool():
  Pool {
  if (pool === undefined) {
    throw new Error(
      "Test database is not initialized",
    );
  }

  return pool;
}

function getWriter():
  TextCopyLogWriter {
  if (writer === undefined) {
    throw new Error(
      "Writer is not initialized",
    );
  }

  return writer;
}

beforeAll(
  async () => {
    pool =
      await createTestDatabase();

    writer =
      new TextCopyLogWriter(
        pool,
      );

    await writer.start();
  },
);

beforeEach(
  async () => {
    await getPool().query(
      "TRUNCATE TABLE logs, log_second_rollups RESTART IDENTITY",
    );
  },
);

afterAll(
  async () => {
    if (writer !== undefined) {
      await writer.close();

      writer = undefined;
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
  "TextCopyLogWriter",
  () => {
    test(
      "preserves timestamp precision, Unicode, and JSON attribute types",
      async () => {
        await getWriter()
          .write([
            {
              timestamp:
                "2026-08-09T12:34:56.123456Z",

              level:
                "error",

              service:
                "text-copy-test",

              message:
                "مرحبا 🔥 payment declined",

              attributes: {
                user_id:
                  "42",

                retries:
                  3,

                premium:
                  true,
              },
            },
          ]);

        const result =
          await getPool()
            .query<{
              id: string;

              timestamp:
                string;

              level: string;

              service: string;

              message: string;

              attributes:
                unknown;

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

          level:
            "error",

          service:
            "text-copy-test",

          message:
            "مرحبا 🔥 payment declined",

          attributes: {
            user_id:
              "42",

            retries:
              3,

            premium:
              true,
          },

          attributes_normalized:
            {
              user_id:
                "42",

              retries:
                "3",

              premium:
                "true",
            },
        });

        const rollup =
          await getPool()
            .query<{
              log_count: string;
            }>(
              `
                SELECT error_count::text
                  AS log_count
                FROM log_second_rollups
                WHERE second_start =
                  '2026-08-09T12:34:56Z'
                  ::timestamptz
                  AND service =
                    'text-copy-test'
              `,
            );

        expect(
          rollup.rows,
        ).toEqual([
          {
            log_count: "1",
          },
        ]);

      },
    );


    test(
      "rolls back the complete COPY batch when one row cannot be routed to a partition",
      async () => {
        /*
         * Bootstrap migrations contain
         * the 2026-08-09 partition.
         *
         * 2026-08-08 deliberately has
         * no partition in this fresh
         * test database.
         */
        await expect(
          getWriter()
            .write([
              {
                timestamp:
                  "2026-08-09T12:00:00Z",

                level:
                  "info",

                service:
                  "rollback-test",

                message:
                  "valid row",

                attributes: {},
              },

              {
                timestamp:
                  "2026-08-08T12:00:00Z",

                level:
                  "error",

                service:
                  "rollback-test",

                message:
                  "missing partition",

                attributes: {},
              },
            ]),
        ).rejects.toThrow();

        const result =
          await getPool()
            .query<{
              count: string;
            }>(
              `
                SELECT count(*)
                FROM logs
                WHERE service =
                  'rollback-test'
              `,
            );

        /*
         * The first valid row must
         * NOT survive the failed COPY.
         */
        expect(
          result.rows[0]?.count,
        ).toBe("0");

        const rollupResult =
          await getPool()
            .query<{
              count: string;
            }>(
              `
                SELECT count(*)
                FROM log_second_rollups
                WHERE service =
                  'rollback-test'
              `,
            );

        expect(
          rollupResult.rows[0]?.count,
        ).toBe("0");
      },
    );


    test(
      "writer remains usable after a rolled-back COPY failure",
      async () => {
        await expect(
          getWriter()
            .write([
              {
                timestamp:
                  "2026-08-08T12:00:00Z",

                level:
                  "error",

                service:
                  "recovery-test",

                message:
                  "expected failure",

                attributes: {},
              },
            ]),
        ).rejects.toThrow();

        /*
         * A failed transaction must
         * have been rolled back
         * correctly, otherwise the
         * PostgreSQL connection would
         * still be in aborted state.
         */
        await getWriter()
          .write([
            {
              timestamp:
                "2026-08-09T13:00:00Z",

              level:
                "info",

              service:
                "recovery-test",

              message:
                "writer recovered",

              attributes: {},
            },
          ]);

        const result =
          await getPool()
            .query<{
              count: string;
            }>(
              `
                SELECT count(*)
                FROM logs
                WHERE service =
                  'recovery-test'
              `,
            );

        expect(
          result.rows[0]?.count,
        ).toBe("1");
      },
    );
  },
);
