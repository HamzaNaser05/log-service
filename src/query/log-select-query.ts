import type {
    LogQueryFilters,
  } from "../domain/log-query.js";
  
  import type {
    LogCursor,
  } from "./log-cursor.js";
  
  import {
    addSqlParameter,
    appendCommonLogFilterConditions,
  } from "./log-filter-sql.js";
  
  import type {
    SqlParameter,
  } from "./log-filter-sql.js";
  
  export type BuiltSqlQuery = {
    text: string;
    values: SqlParameter[];
  };
  
  export function buildLogSelectQuery(
    filters: LogQueryFilters,
    decodedCursor: LogCursor | null = null,
  ): BuiltSqlQuery {
    if (
      filters.cursor !== null &&
      decodedCursor === null
    ) {
      throw new Error(
        "opaque cursor was not decoded",
      );
    }
  
    if (
      filters.cursor === null &&
      decodedCursor !== null
    ) {
      throw new Error(
        "decoded cursor provided without opaque cursor",
      );
    }
  
    const values: SqlParameter[] = [];
  
    const conditions: string[] = [];
  
    appendCommonLogFilterConditions(
      filters,
      values,
      conditions,
    );
  
    if (decodedCursor !== null) {
      const timestampParameter =
        addSqlParameter(
          values,
          decodedCursor.timestamp,
        );
  
      const idParameter =
        addSqlParameter(
          values,
          decodedCursor.id,
        );
  
      conditions.push(
        `(timestamp, id) < (${timestampParameter}::timestamptz, ${idParameter}::bigint)`,
      );
    }
  
    const limitParameter =
      addSqlParameter(
        values,
        filters.limit + 1,
      );
  
    const lines = [
      "SELECT",
      "  id,",
      "  to_char(",
      "    timestamp AT TIME ZONE 'UTC',",
      `    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`,
      "  ) AS timestamp,",
      "  level,",
      "  service,",
      "  message,",
      "  attributes",
      "FROM logs",
    ];
  
    if (conditions.length > 0) {
      lines.push(
        "WHERE",
        `  ${conditions.join(
          "\n  AND ",
        )}`,
      );
    }
  
    lines.push(
      "ORDER BY logs.timestamp DESC, logs.id DESC",      
        `LIMIT ${limitParameter}`,
    );
  
    return {
      text: lines.join("\n"),
      values,
    };
  }