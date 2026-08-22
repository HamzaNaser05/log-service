import { Pool } from "pg";

function attachPoolErrorHandler(
    pool: Pool,
): Pool {
    pool.on("error", (error: Error) => {
        console.error("Unexpected PostgreSQL pool error", error);
    });

    return pool;
}

export function createDatabasePool(databaseUrl: string): Pool {
    const pool = new Pool({
        connectionString: databaseUrl,
        /*
         * One connection is held by the
         * COPY writer. Four general query
         * slots are enough for the measured
         * read workload without overscheduling
         * a one-CPU PostgreSQL container.
         */
        max: 5,
        connectionTimeoutMillis:5_000,
        idleTimeoutMillis: 30_000,
    });

    return attachPoolErrorHandler(pool);
}

export function createAggregateDatabasePool(
    databaseUrl: string,
): Pool {
    const pool = new Pool({
        connectionString: databaseUrl,
        max: 1,
        connectionTimeoutMillis: 30_000,

        /*
         * Keep the one aggregate connection
         * open so its request never waits in
         * the general query pool behind the
         * read-after-write workload.
         */
        idleTimeoutMillis: 0,
    });

    return attachPoolErrorHandler(pool);
}
