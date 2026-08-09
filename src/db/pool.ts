import { Pool } from "pg";

export function createDatabasePool(databaseUrl: string): Pool {
    const pool = new Pool({
        connectionString: databaseUrl,
        max: 5,
        connectionTimeoutMillis:5_000,
        idleTimeoutMillis: 30_000,
    })

    pool.on("error", (error: Error)=> {
        console.error("Unexpected PostgreSQL pool error", error);
    })
    return pool;
}
