import {
    loadConfig,
  } from "./config.js";
  
  import {
    runMigrations,
  } from "./db/migrate.js";
  
  import {
    createDatabasePool,
  } from "./db/pool.js";
  
  import {
    buildServer,
  } from "./http/server.js";
  
  import {
    runLogPartitionMaintenance,
    startLogPartitionMaintenanceLoop,
  } from "./partitioning/maintenance.js";
  
  async function main(): Promise<void> {
    const config =
      loadConfig();
  
    const pool =
      createDatabasePool(
        config.databaseUrl,
      );
  
    try {
      await runMigrations(pool);
  
      const initialMaintenance =
        await runLogPartitionMaintenance(
          pool,
          {
            retentionDays:
              config.retentionDays,
  
            aheadDays:
              config
                .partitionAheadDays,
          },
        );
  
      console.info(
        "Initial log partition maintenance completed",
        initialMaintenance,
      );
  
      const server =
        buildServer(pool);
  
      await server.listen({
        host: "0.0.0.0",
        port: config.port,
      });
  
      startLogPartitionMaintenanceLoop(
        pool,
        {
          retentionDays:
            config.retentionDays,
  
          aheadDays:
            config
              .partitionAheadDays,
        },
      );
    } catch (error: unknown) {
      await pool.end();
  
      throw error;
    }
  }
  
  main().catch(
    (error: unknown) => {
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