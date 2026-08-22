import {
  loadConfig,
} from "./config.js";

import {
  runMigrations,
} from "./db/migrate.js";

import {
  createAggregateDatabasePool,
  createDatabasePool,
} from "./db/pool.js";

import {
  buildServer,
} from "./http/server.js";

import {
  TextCopyLogWriter,
} from "./ingestion/text-copy-writer.js";

import {
  LogIngestionQueue,
} from "./ingestion/log-ingestion-queue.js";

import {
  ParallelLogWriter,
} from "./ingestion/parallel-log-writer.js";

import {
  createGracefulShutdown,
} from "./lifecycle/graceful-shutdown.js";

import {
  runLogPartitionMaintenance,
  startLogPartitionMaintenanceLoop,
} from "./partitioning/maintenance.js";

type ShutdownSignal =
  | "SIGINT"
  | "SIGTERM";

async function main(): Promise<void> {
  const config =
    loadConfig();

  const pool =
    createDatabasePool(
      config.databaseUrl,
    );

  const aggregatePool =
    createAggregateDatabasePool(
      config.databaseUrl,
    );

  /*
   * Keep this outside the try block
   * so startup error handling can
   * close it if necessary.
   */
  let ingestionQueue:
    LogIngestionQueue | null =
    null;

  try {
    /*
     * 1. Database migrations
     */
    await runMigrations(
      pool,
    );

    /*
     * 2. Ensure partitions exist
     * before accepting traffic.
     */
    const initialMaintenance =
      await runLogPartitionMaintenance(
        pool,
        {
          retentionDays:
            config.retentionDays,

          aheadDays:
            config.partitionAheadDays,
        },
      );

    console.info(
      "Initial log partition maintenance completed",
      initialMaintenance,
    );

    /*
     * 3. Create the dedicated
     * PostgreSQL COPY writers.
     *
     * Each writer reserves one client
     * from the PostgreSQL pool and
     * keeps it dedicated to ingestion.
     */
    /*
     * 4. Create the bounded
     * micro-batching queue.
     */
    ingestionQueue =
      new LogIngestionQueue(
        new ParallelLogWriter(
          Array.from(
            {
              length:
                config.ingestionWriterCount,
            },
            (
              _unused,
              writerShard,
            ) =>
              new TextCopyLogWriter(
                pool,
                writerShard,
              ),
          ),
        ),
        {
          maxBufferedLogs:
            config
              .ingestionQueueMaxLogs,

          maxMicrobatchLogs:
            config
              .ingestionMicrobatchMaxLogs,

          flushThresholdLogs:
            config
              .ingestionMicrobatchFlushLogs,

          maxWaitMilliseconds:
            config
              .ingestionMicrobatchMaxWaitMs,

          retryAfterSeconds:
            config
              .ingestionRetryAfterSeconds,

          maxConcurrentFlushes:
            config
              .ingestionWriterCount,
        },
      );

    /*
     * 5. Reserve/start the dedicated
     * PostgreSQL writer connection
     * before the HTTP server starts.
     */
    await ingestionQueue.start();

    /*
     * Establish the reserved aggregate
     * connection before health can report
     * the service as ready.
     */
    await aggregatePool.query(
      "SELECT 1",
    );

    /*
     * 6. Build Fastify using our
     * ingestion queue.
     */
    const server =
      buildServer(
        pool,
        true,
        ingestionQueue,
        config.corsOrigins,
        aggregatePool,
      );

    /*
     * 7. Start accepting requests.
     */
    await server.listen({
      host: "0.0.0.0",
      port: config.port,
    });

    /*
     * 8. Start hourly partition
     * maintenance.
     */
    const maintenanceTimer =
      startLogPartitionMaintenanceLoop(
        pool,
        {
          retentionDays:
            config.retentionDays,

          aheadDays:
            config.partitionAheadDays,
        },
      );

    /*
     * server.close()
     *
     * Fastify onClose hook will
     * drain/close ingestionQueue.
     *
     * After that we close the
     * PostgreSQL pool.
     */
    const shutdown =
      createGracefulShutdown({
        stopMaintenance:
          () => {
            clearInterval(
              maintenanceTimer,
            );
          },

        closeServer:
          async () => {
            await server.close();
          },

        closeDatabase:
          async () => {
            await aggregatePool.end();
            await pool.end();
          },
      });

    let signalHandled =
      false;

    const handleSignal = (
      signal: ShutdownSignal,
    ): void => {
      if (signalHandled) {
        return;
      }

      signalHandled = true;

      console.info(
        `Received ${signal}; starting graceful shutdown`,
      );

      void shutdown()
        .then(() => {
          console.info(
            "Graceful shutdown completed",
          );
        })
        .catch(
          (
            error: unknown,
          ) => {
            const message =
              error instanceof Error
                ? error.message
                : "Unknown shutdown error";

            console.error(
              `Graceful shutdown failed: ${message}`,
            );

            process.exitCode = 1;
          },
        );
    };

    process.once(
      "SIGINT",
      () => {
        handleSignal(
          "SIGINT",
        );
      },
    );

    process.once(
      "SIGTERM",
      () => {
        handleSignal(
          "SIGTERM",
        );
      },
    );
  } catch (
  error: unknown
  ) {
    /*
     * If startup failed AFTER the
     * ingestion writer acquired a
     * PostgreSQL connection, release
     * it before pool.end().
     */
    if (
      ingestionQueue !== null
    ) {
      try {
        await ingestionQueue.close();
      } catch (
      closeError: unknown
      ) {
        console.error(
          "Failed to close ingestion queue after startup failure",
          closeError,
        );
      }
    }

    await Promise.allSettled([
      aggregatePool.end(),
      pool.end(),
    ]);

    throw error;
  }
}

main().catch(
  (
    error: unknown,
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown startup error";

    console.error(
      `Application startup failed: ${message}`,
    );

    process.exitCode = 1;
  },
);
