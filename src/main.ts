import { loadConfig } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { createDatabasePool } from "./db/pool.js";
import { buildServer } from "./http/server.js";

async function main() {
    const config = loadConfig()

    const pool = createDatabasePool(
        config.databaseUrl
    )
    try {
        await runMigrations(pool)
        const server = buildServer(pool)

        await server.listen({
            host: "0.0.0.0",
            port: config.port
        })

    } catch (error) {
        await pool.end()
        throw error;
    }
}

main().catch((error: unknown) => {
    const message =
        error instanceof Error
            ? error.message
            : "Unknown startup error"

    console.error(`Application startup failed: ${message}`);

    process.exitCode = 1;
})

