import type {
    Pool,
  } from "pg";
  
  import {
    ensureLogPartitionWindow,
  } from "./log-partitions.js";
  
  import {
    MILLISECONDS_PER_DAY,
  } from "./utc-day.js";
  
  import {
    applyLogRetention,
  } from "../retention/log-retention.js";
  
  const PARTITION_MAINTENANCE_LOCK_KEY =
    42_424_243;
  
  const MAINTENANCE_INTERVAL_MS =
    60 * 60 * 1000;
  
  export type PartitionMaintenanceOptions = {
    retentionDays: number;
    aheadDays: number;
  };
  
  export type PartitionMaintenanceResult = {
    cutoff: string;
  
    createdPartitions:
      string[];
  
    droppedPartitions:
      string[];
  
    deletedCutoffRows:
      number;
  };
  
  export async function runLogPartitionMaintenance(
    pool: Pool,
    options:
      PartitionMaintenanceOptions,
    now: Date = new Date(),
  ): Promise<
    PartitionMaintenanceResult
  > {
    const cutoff = new Date(
      now.getTime() -
        options.retentionDays *
          MILLISECONDS_PER_DAY,
    );
  
    const client =
      await pool.connect();
  
    let transactionStarted =
      false;
  
    try {
      await client.query("BEGIN");
  
      transactionStarted = true;
  
      await client.query(
        `
          SELECT
            pg_advisory_xact_lock(
              $1::bigint
            )
        `,
        [
          PARTITION_MAINTENANCE_LOCK_KEY,
        ],
      );
  
      const createdPartitions =
        await ensureLogPartitionWindow(
          client,
          cutoff,
          now,
          options.aheadDays,
        );
  
      const retentionResult =
        await applyLogRetention(
          client,
          cutoff,
        );
  
      await client.query("COMMIT");
  
      return {
        cutoff:
          cutoff.toISOString(),
  
        createdPartitions,
  
        droppedPartitions:
          retentionResult
            .droppedPartitions,
  
        deletedCutoffRows:
          retentionResult
            .deletedCutoffRows,
      };
    } catch (error: unknown) {
      if (transactionStarted) {
        try {
          await client.query(
            "ROLLBACK",
          );
        } catch (
          rollbackError: unknown
        ) {
          console.error(
            "Partition maintenance rollback failed",
            rollbackError,
          );
        }
      }
  
      throw error;
    } finally {
      client.release();
    }
  }
  
  export function startLogPartitionMaintenanceLoop(
    pool: Pool,
    options:
      PartitionMaintenanceOptions,
  ): NodeJS.Timeout {
    const timer = setInterval(
      () => {
        void runLogPartitionMaintenance(
          pool,
          options,
        )
          .then((result) => {
            const changed =
              result
                .createdPartitions
                .length > 0 ||
              result
                .droppedPartitions
                .length > 0 ||
              result
                .deletedCutoffRows >
                0;
  
            if (changed) {
              console.info(
                "Log partition maintenance completed",
                result,
              );
            }
          })
          .catch(
            (error: unknown) => {
              console.error(
                "Log partition maintenance failed",
                error,
              );
            },
          );
      },
      MAINTENANCE_INTERVAL_MS,
    );
  
    /*
     * The Fastify server should keep
     * the process alive, not this
     * maintenance timer.
     */
    timer.unref();
  
    return timer;
  }