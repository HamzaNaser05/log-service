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
    insertLogs,
  } from "../../src/persistence/log-repository.js";
  
  import {
    runLogPartitionMaintenance,
  } from "../../src/partitioning/maintenance.js";
  
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
    pool =
      await createTestDatabase();
  });
  
  beforeEach(async () => {
    await getPool().query(
      "TRUNCATE TABLE logs, log_minute_rollups RESTART IDENTITY",
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
    "log partition maintenance",
    () => {
      test(
        "creates partitions, drops expired days, and trims the cutoff day",
        async () => {
          const testPool =
            getPool();
  
          /*
           * First maintenance:
           *
           * now:
           * Aug 9 12:00
           *
           * retention:
           * 2 days
           *
           * cutoff:
           * Aug 7 12:00
           *
           * partitions include:
           * Aug 7 → Aug 10
           */
          await runLogPartitionMaintenance(
            testPool,
            {
              retentionDays: 2,
              aheadDays: 1,
            },
            new Date(
              "2026-08-09T12:00:00Z",
            ),
          );
  
          await insertLogs(
            testPool,
            [
              {
                timestamp:
                  "2026-08-08T23:00:00Z",
  
                level: "info",
  
                service:
                  "retention-test",
  
                message:
                  "whole partition expires",
  
                attributes: {},
              },
  
              {
                timestamp:
                  "2026-08-09T10:00:00Z",
  
                level: "info",
  
                service:
                  "retention-test",
  
                message:
                  "cutoff row expires",
  
                attributes: {},
              },
  
              {
                timestamp:
                  "2026-08-09T13:00:00Z",
  
                level: "info",
  
                service:
                  "retention-test",
  
                message:
                  "retained row",
  
                attributes: {},
              },
            ],
          );
  
          /*
           * Second maintenance:
           *
           * now:
           * Aug 11 12:00
           *
           * retention:
           * 2 days
           *
           * cutoff:
           * Aug 9 12:00
           *
           * Aug 8 partition:
           * completely expired
           *
           * Aug 9:
           * partially expired
           */
          const maintenance =
            await runLogPartitionMaintenance(
              testPool,
              {
                retentionDays: 2,
                aheadDays: 1,
              },
              new Date(
                "2026-08-11T12:00:00Z",
              ),
            );
  
          expect(
            maintenance
              .droppedPartitions,
          ).toContain(
            "logs_2026_08_08",
          );
  
          expect(
            maintenance
              .deletedCutoffRows,
          ).toBe(1);
  
          const remaining =
            await testPool.query<{
              message: string;
            }>(
              `
                SELECT message
                FROM logs
                WHERE service =
                  'retention-test'
                ORDER BY timestamp
              `,
            );
  
          expect(
            remaining.rows,
          ).toEqual([
            {
              message:
                "retained row",
            },
          ]);

          const remainingRollups =
            await testPool.query<{
              minute_start: string;
              log_count: string;
            }>(
              `
                SELECT
                  to_char(
                    minute_start
                      AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
                  ) AS minute_start,
                  log_count::text
                FROM log_minute_rollups
                WHERE service =
                  'retention-test'
                ORDER BY minute_start
              `,
            );

          expect(
            remainingRollups.rows,
          ).toEqual([
            {
              minute_start:
                "2026-08-09T13:00:00Z",
              log_count: "1",
            },
          ]);
  
          const oldPartition =
            await testPool.query<{
              relation:
                string | null;
            }>(
              `
                SELECT
                  to_regclass(
                    'logs_2026_08_08'
                  )::text
                    AS relation
              `,
            );
  
          expect(
            oldPartition.rows[0]
              ?.relation,
          ).toBeNull();
  
          /*
           * aheadDays = 1,
           * so Aug 12 must already exist.
           */
          const futurePartition =
            await testPool.query<{
              relation:
                string | null;
            }>(
              `
                SELECT
                  to_regclass(
                    'logs_2026_08_12'
                  )::text
                    AS relation
              `,
            );
  
          expect(
            futurePartition.rows[0]
              ?.relation,
          ).toBe(
            "logs_2026_08_12",
          );
  
          /*
           * Prove the future partition
           * can immediately accept logs.
           */
          await insertLogs(
            testPool,
            [
              {
                timestamp:
                  "2026-08-12T00:01:00Z",
  
                level: "info",
  
                service:
                  "future-partition-test",
  
                message:
                  "future partition works",
  
                attributes: {
                  region:
                    "eu-west",
                },
              },
            ],
          );
  
          const futureCount =
            await testPool.query<{
              count: string;
            }>(
              `
                SELECT count(*)
                FROM logs
                WHERE service =
                  'future-partition-test'
              `,
            );
  
          expect(
            futureCount.rows[0]
              ?.count,
          ).toBe("1");
  
          /*
           * Future partitions should
           * inherit parent indexes,
           * including our GIN index.
           */
          const indexes =
            await testPool.query<{
              indexdef: string;
            }>(
              `
                SELECT indexdef
                FROM pg_indexes
                WHERE tablename =
                  'logs_2026_08_12'
              `,
            );
  
          expect(
            indexes.rows.some(
              ({ indexdef }) =>
                indexdef.includes(
                  "USING gin",
                ) &&
                indexdef.includes(
                  "attributes_normalized",
                ),
            ),
          ).toBe(true);
  
          expect(
            indexes.rows.some(
              ({ indexdef }) =>
                indexdef.includes(
                  "service",
                ) &&
                indexdef.includes(
                  "timestamp",
                ),
            ),
          ).toBe(true);
        },
      );
    },
  );
