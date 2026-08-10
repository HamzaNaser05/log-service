import type {
    Pool,
  } from "pg";
  
  import type {
    LogAttributes,
    LogLevel,
  } from "../domain/log.js";
  
  import type {
    LogQueryFilters,
  } from "../domain/log-query.js";
  
  import {
    buildLogSelectQuery,
  } from "../query/log-select-query.js";
  
  import {
    encodeLogCursor,
  } from "../query/log-cursor.js";
  
  import type {
    LogCursor,
  } from "../query/log-cursor.js";
  
  export type QueriedLog = {
    id: string;
    timestamp: string;
    level: LogLevel;
    service: string;
    message: string;
    attributes: LogAttributes;
  };
  
  export type LogQueryPage = {
    logs: QueriedLog[];
    nextCursor: string | null;
  };
  
  export async function queryLogs(
    pool: Pool,
    filters: LogQueryFilters,
    cursor: LogCursor | null,
  ): Promise<LogQueryPage> {
    const query =
      buildLogSelectQuery(
        filters,
        cursor,
      );
  
    const result =
      await pool.query<QueriedLog>(
        query.text,
        query.values,
      );
  
    const hasMore =
      result.rows.length >
      filters.limit;
  
    const logs = hasMore
      ? result.rows.slice(
          0,
          filters.limit,
        )
      : result.rows;
  
    if (!hasMore) {
      return {
        logs,
        nextCursor: null,
      };
    }
  
    const lastLog =
      logs.at(-1);
  
    if (lastLog === undefined) {
      throw new Error(
        "pagination invariant violated: expected a last log",
      );
    }
  
    return {
      logs,
  
      nextCursor: encodeLogCursor({
        timestamp:
          lastLog.timestamp,
        id: lastLog.id,
      }),
    };
  }