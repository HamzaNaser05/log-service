import type {
    PoolClient,
  } from "pg";
  
  import {
    listManagedLogPartitions,
    logPartitionExists,
  } from "../partitioning/log-partitions.js";
  
  import {
    addUtcDays,
    logPartitionNameForDay,
    startOfUtcDay,
  } from "../partitioning/utc-day.js";
  
  export type LogRetentionResult = {
    droppedPartitions:
      string[];
  
    deletedCutoffRows:
      number;

    deletedRollupRows:
      number;
  };
  
  export async function applyLogRetention(
    client: PoolClient,
    cutoff: Date,
  ): Promise<LogRetentionResult> {
    const partitions =
      await listManagedLogPartitions(
        client,
      );
  
    const droppedPartitions:
      string[] = [];
  
    /*
     * Whole partitions completely
     * before the retention cutoff
     * can be dropped directly.
     */
    for (
      const partition of partitions
    ) {
      const partitionEnd =
        addUtcDays(
          partition.day,
          1,
        );
  
      if (
        partitionEnd.getTime() <=
        cutoff.getTime()
      ) {
        await client.query(
          `DROP TABLE ${partition.name}`,
        );
  
        droppedPartitions.push(
          partition.name,
        );
      }
    }
  
    /*
     * The partition containing the
     * exact cutoff cannot be dropped,
     * because part of it may still be
     * inside the retention window.
     *
     * Example:
     *
     * cutoff = 2026-08-09 14:30 UTC
     *
     * delete:
     * 00:00 → 14:29...
     *
     * keep:
     * 14:30 → 23:59...
     */
    const cutoffDay =
      startOfUtcDay(cutoff);
  
    const cutoffPartition =
      logPartitionNameForDay(
        cutoffDay,
      );
  
    let deletedCutoffRows = 0;
  
    if (
      await logPartitionExists(
        client,
        cutoffPartition,
      )
    ) {
      const result =
        await client.query(
          `
            DELETE FROM ${cutoffPartition}
            WHERE timestamp <
              $1::timestamptz
          `,
          [
            cutoff.toISOString(),
          ],
        );
  
      deletedCutoffRows =
        result.rowCount ?? 0;
    }

    /*
     * Rollups are not partitioned because
     * they remain much smaller than raw logs.
     * Remove expired seconds, then rebuild
     * the cutoff second after
     * the raw-row delete above so a partial
     * retention boundary stays exact.
     */
    const deletedRollups =
      await client.query(
        `
          DELETE FROM log_second_rollups
          WHERE second_start <=
            date_trunc(
              'second',
              $1::timestamptz
            )
        `,
        [
          cutoff.toISOString(),
        ],
      );

    await client.query(
      `
        INSERT INTO log_second_rollups (
          second_start,
          service,
          debug_count,
          info_count,
          warn_count,
          error_count
        )
        SELECT
          date_trunc(
            'second',
            timestamp
          ),
          service,
          count(*) FILTER (
            WHERE level = 'debug'
          ),
          count(*) FILTER (
            WHERE level = 'info'
          ),
          count(*) FILTER (
            WHERE level = 'warn'
          ),
          count(*) FILTER (
            WHERE level = 'error'
          )
        FROM logs
        WHERE timestamp >=
          date_trunc(
            'second',
            $1::timestamptz
          )
          AND timestamp <
            date_trunc(
              'second',
              $1::timestamptz
            ) + INTERVAL '1 second'
        GROUP BY
          date_trunc(
            'second',
            timestamp
          ),
          service
      `,
      [
        cutoff.toISOString(),
      ],
    );

    return {
      droppedPartitions,
      deletedCutoffRows,
      deletedRollupRows:
        deletedRollups.rowCount ?? 0,
    };
  }
