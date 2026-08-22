import {
    Readable,
  } from "node:stream";
  
  import {
    pipeline,
  } from "node:stream/promises";
  
  import {
    from as copyFrom,
  } from "pg-copy-streams";
  
  import type {
    Pool,
    PoolClient,
  } from "pg";
  
  import type {
    ValidatedLogEntry,
  } from "../domain/log.js";
  
  import {
    encodeLogsForTextCopy,
  } from "./text-copy.js";

  import {
    upsertMinuteRollups,
  } from "./log-minute-rollup.js";
  
  import type {
    LogBatchWriter,
  } from "./log-batch-writer.js";
  
  const COPY_LOGS_SQL = `
    COPY logs (
      timestamp,
      level,
      service,
      message,
      attributes,
      attributes_normalized
    )
    FROM STDIN
    WITH (FORMAT text)
  `;
  
  export class TextCopyLogWriter
  implements LogBatchWriter {
    private client:
      PoolClient | null = null;
  
    private closed = false;
  
    public constructor(
      private readonly pool: Pool,
      private readonly writerShard = 0,
    ) {}
  
    public async start():
      Promise<void> {
      if (this.closed) {
        throw new Error(
          "Text COPY writer is closed",
        );
      }
  
      if (
        this.client !== null
      ) {
        return;
      }
  
      this.client =
        await this.pool.connect();
    }
  
    private async getClient():
      Promise<PoolClient> {
      await this.start();
  
      const client =
        this.client;
  
      if (client === null) {
        throw new Error(
          "Text COPY writer failed to acquire a PostgreSQL client",
        );
      }
  
      return client;
    }
  
    private destroyClient(
      client: PoolClient,
    ): void {
      if (
        this.client === client
      ) {
        this.client = null;
      }
  
      client.release(true);
    }
  
    public async write(
      logs:
        readonly ValidatedLogEntry[],
    ): Promise<void> {
      if (
        logs.length === 0
      ) {
        return;
      }
  
      if (this.closed) {
        throw new Error(
          "Text COPY writer is closed",
        );
      }
  
      /*
       * Encode before opening the
       * transaction.
       */
      const payload =
        encodeLogsForTextCopy(
          logs,
        );
  
      const client =
        await this.getClient();
  
      let transactionStarted =
        false;
  
      try {
        await client.query(
          "BEGIN",
        );
  
        transactionStarted = true;
  
        const copyStream =
          client.query(
            copyFrom(
              COPY_LOGS_SQL,
            ),
          );
  
        const source =
          Readable.from([
            payload,
          ]);
  
        await pipeline(
          source,
          copyStream,
        );

        await upsertMinuteRollups(
          client,
          logs,
          this.writerShard,
        );
  
        await client.query(
          "COMMIT",
        );
      } catch (
        error: unknown
      ) {
        if (
          transactionStarted
        ) {
          try {
            await client.query(
              "ROLLBACK",
            );
          } catch (
            rollbackError:
              unknown
          ) {
            console.error(
              "Text COPY rollback failed",
              rollbackError,
            );
  
            this.destroyClient(
              client,
            );
          }
        } else {
          /*
           * BEGIN itself failed,
           * so assume this connection
           * should not be reused.
           */
          this.destroyClient(
            client,
          );
        }
  
        throw error;
      }
    }
  
    public async close():
      Promise<void> {
      if (this.closed) {
        return;
      }
  
      this.closed = true;
  
      const client =
        this.client;
  
      this.client = null;
  
      if (client !== null) {
        client.release();
      }
    }
  }
