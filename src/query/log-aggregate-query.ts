import type {
    AggregateBucket,
    AggregateGroupBy,
    LogAggregateFilters,
  } from "../domain/log-aggregate.js";
  
  import {
    addSqlParameter,
    appendCommonLogFilterConditions,
  } from "./log-filter-sql.js";
  
  import type {
    BuiltSqlQuery,
  } from "./log-select-query.js";
  
  import type {
    SqlParameter,
  } from "./log-filter-sql.js";
  
  const BUCKET_INTERVALS:
    Record<
      AggregateBucket,
      string
    > = {
      "1m": "1 minute",
      "5m": "5 minutes",
      "1h": "1 hour",
      "1d": "1 day",
    };
  
  const GROUP_BY_EXPRESSIONS:
    Record<
      AggregateGroupBy,
      string
    > = {
      service: "service",
      level: "level",
    };
  
  export function buildLogAggregateQuery(
    filters: LogAggregateFilters,
  ): BuiltSqlQuery {
    const values: SqlParameter[] = [];
  
    const conditions: string[] = [];
  
    const bucketInterval =
      BUCKET_INTERVALS[
        filters.bucket
      ];
  
    const bucketParameter =
      addSqlParameter(
        values,
        bucketInterval,
      );
  
    appendCommonLogFilterConditions(
      filters,
      values,
      conditions,
    );
  
    const groupExpression =
      filters.groupBy === null
        ? "NULL::text"
        : GROUP_BY_EXPRESSIONS[
            filters.groupBy
          ];
  
    const lines = [
      "SELECT",
      "  to_char(",
      "    bucket_start AT TIME ZONE 'UTC',",
      `    'YYYY-MM-DD"T"HH24:MI:SS"Z"'`,
      "  ) AS start,",
      `  group_value AS "group",`,
      "  count(*)::text AS count",
      "FROM (",
      "  SELECT",
      `    date_bin(${bucketParameter}::interval, timestamp, TIMESTAMPTZ '1970-01-01 00:00:00+00') AS bucket_start,`,
      `    ${groupExpression} AS group_value`,
      "  FROM logs",
    ];
  
    if (conditions.length > 0) {
      lines.push(
        "  WHERE",
        `    ${conditions.join(
          "\n    AND ",
        )}`,
      );
    }
  
    lines.push(
      ") AS bucketed",
      "GROUP BY bucket_start, group_value",
      "ORDER BY bucket_start ASC, group_value ASC NULLS FIRST",
    );
  
    return {
      text: lines.join("\n"),
      values,
    };
  }