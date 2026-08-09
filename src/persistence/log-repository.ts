import type {
    Pool,
    PoolClient,
  } from "pg";
  
  import type {
    ValidatedLogEntry,
  } from "../domain/log.js";
  
  async function insertLog(
    client: PoolClient,
    log: ValidatedLogEntry,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO logs (
          timestamp,
          level,
          service,
          message,
          attributes
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::jsonb
        )
      `,
      [
        log.timestamp,
        log.level,
        log.service,
        log.message,
        JSON.stringify(log.attributes),
      ],
    );
  }
  
  export async function insertLogs(
    pool: Pool,
    logs: readonly ValidatedLogEntry[],
  ): Promise<number> {
    if (logs.length === 0) {
      return 0;
    }
  
    const client = await pool.connect();
  
    let transactionStarted = false;
  
    try {
      await client.query("BEGIN");
      transactionStarted = true;
  
      for (const log of logs) {
        await insertLog(client, log);
      }
  
      await client.query("COMMIT");
  
      return logs.length;
    } catch (error: unknown) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError: unknown) {
          console.error(
            "Log ingestion rollback failed",
            rollbackError,
          );
        }
      }
  
      throw error;
    } finally {
      client.release();
    }
  }