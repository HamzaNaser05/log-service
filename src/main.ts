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
    IngestionAdmissionController,
} from "./ingestion/admission-controller.js";

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

async function main():
    Promise<void> {
    const config =
        loadConfig();

    const pool =
        createDatabasePool(
            config.databaseUrl,
        );

    try {
        await runMigrations(
            pool,
        );

        const initialMaintenance =
            await runLogPartitionMaintenance(
                pool,
                {
                    retentionDays:
                        config
                            .retentionDays,

                    aheadDays:
                        config
                            .partitionAheadDays,
                },
            );

        console.info(
            "Initial log partition maintenance completed",
            initialMaintenance,
        );

        const ingestionAdmission =
            new IngestionAdmissionController(
                config
                    .ingestionMaxInFlight,

                config
                    .ingestionRetryAfterSeconds,
            );

        const server =
            buildServer(
                pool,
                true,
                ingestionAdmission,
            );

        await server.listen({
            host:
                "0.0.0.0",

            port:
                config.port,
        });

        const maintenanceTimer =
            startLogPartitionMaintenanceLoop(
                pool,
                {
                    retentionDays:
                        config
                            .retentionDays,

                    aheadDays:
                        config
                            .partitionAheadDays,
                },
            );

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
                        await pool.end();
                    },
            });

        let signalHandled =
            false;

        const handleSignal = (
            signal:
                ShutdownSignal,
        ): void => {
            if (signalHandled) {
                return;
            }

            signalHandled = true;

            console.info(
                `\nReceived ${signal}; starting graceful shutdown`,
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
        await pool.end();

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