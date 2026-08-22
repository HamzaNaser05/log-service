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
  SqlParameter,
} from "./log-filter-sql.js";

import type {
  BuiltSqlQuery,
} from "./log-select-query.js";

const BUCKET_INTERVALS:
  Record<AggregateBucket, string> = {
    "1m": "1 minute",
    "5m": "5 minutes",
    "1h": "1 hour",
    "1d": "1 day",
  };

const GROUP_BY_EXPRESSIONS:
  Record<AggregateGroupBy, string> = {
    service: "service",
    level: "level",
  };

function buildRawLogAggregateQuery(
  filters: LogAggregateFilters,
): BuiltSqlQuery {
  const values: SqlParameter[] = [];
  const conditions: string[] = [];

  const bucketParameter =
    addSqlParameter(
      values,
      BUCKET_INTERVALS[filters.bucket],
    );

  appendCommonLogFilterConditions(
    filters,
    values,
    conditions,
  );

  const groupExpression =
    filters.groupBy === null
      ? "NULL::text"
      : GROUP_BY_EXPRESSIONS[filters.groupBy];

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
      `    ${conditions.join("\n    AND ")}`,
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

function appendRollupDimensionConditions(
  filters: LogAggregateFilters,
  values: SqlParameter[],
  rollupConditions: string[],
  rawConditions: string[],
): void {
  if (filters.service !== null) {
    const parameter =
      addSqlParameter(
        values,
        filters.service,
      );

    rollupConditions.push(
      `rollup.service = ${parameter}`,
    );
    rawConditions.push(
      `log.service = ${parameter}`,
    );
  }

  if (filters.level !== null) {
    const parameter =
      addSqlParameter(
        values,
        filters.level,
      );

    rollupConditions.push(
      `rollup.level = ${parameter}`,
    );
    rawConditions.push(
      `log.level = ${parameter}`,
    );
  }
}

function buildRollupLogAggregateQuery(
  filters: LogAggregateFilters,
): BuiltSqlQuery {
  if (
    filters.since === null ||
    filters.until === null
  ) {
    throw new Error(
      "Aggregation requires since and until",
    );
  }

  const values: SqlParameter[] = [];

  const bucketParameter =
    addSqlParameter(
      values,
      BUCKET_INTERVALS[filters.bucket],
    );

  const sinceParameter =
    addSqlParameter(
      values,
      filters.since,
    );

  const untilParameter =
    addSqlParameter(
      values,
      filters.until,
    );

  const rollupConditions: string[] = [];
  const rawConditions: string[] = [];

  appendRollupDimensionConditions(
    filters,
    values,
    rollupConditions,
    rawConditions,
  );

  const groupExpression =
    filters.groupBy === null
      ? "NULL::text"
      : GROUP_BY_EXPRESSIONS[filters.groupBy];

  const rollupDimensionSql =
    rollupConditions.length === 0
      ? ""
      : `\n    AND ${rollupConditions.join("\n    AND ")}`;

  const rawDimensionSql =
    rawConditions.length === 0
      ? ""
      : `\n    AND ${rawConditions.join("\n    AND ")}`;

  return {
    text: `
WITH bounds AS (
  SELECT
    ${sinceParameter}::timestamptz AS since_time,
    ${untilParameter}::timestamptz AS until_time,
    CASE
      WHEN ${sinceParameter}::timestamptz =
        date_trunc('minute', ${sinceParameter}::timestamptz)
      THEN ${sinceParameter}::timestamptz
      ELSE date_trunc('minute', ${sinceParameter}::timestamptz) +
        INTERVAL '1 minute'
    END AS full_start,
    date_trunc('minute', ${untilParameter}::timestamptz) AS full_end
),
minute_counts AS (
  SELECT
    rollup.minute_start,
    rollup.service,
    rollup.level,
    rollup.log_count
  FROM log_minute_rollups AS rollup
  CROSS JOIN bounds
  WHERE bounds.full_start < bounds.full_end
    AND rollup.minute_start >= bounds.full_start
    AND rollup.minute_start < bounds.full_end${rollupDimensionSql}

  UNION ALL

  SELECT
    date_trunc('minute', log.timestamp) AS minute_start,
    log.service,
    log.level,
    count(*)::bigint AS log_count
  FROM logs AS log
  CROSS JOIN bounds
  WHERE log.timestamp >= bounds.since_time
    AND log.timestamp < bounds.until_time
    AND (
      bounds.full_start >= bounds.full_end
      OR log.timestamp < bounds.full_start
      OR log.timestamp >= bounds.full_end
    )${rawDimensionSql}
  GROUP BY
    date_trunc('minute', log.timestamp),
    log.service,
    log.level
),
bucketed AS (
  SELECT
    date_bin(
      ${bucketParameter}::interval,
      minute_start,
      TIMESTAMPTZ '1970-01-01 00:00:00+00'
    ) AS bucket_start,
    ${groupExpression} AS group_value,
    sum(log_count)::bigint AS log_count
  FROM minute_counts
  GROUP BY bucket_start, group_value
)
SELECT
  to_char(
    bucket_start AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
  ) AS start,
  group_value AS "group",
  log_count::text AS count
FROM bucketed
ORDER BY bucket_start ASC, group_value ASC NULLS FIRST
`.trim(),
    values,
  };
}

export function buildLogAggregateQuery(
  filters: LogAggregateFilters,
): BuiltSqlQuery {
  const requiresRawLogs =
    filters.attributeFilters.length > 0 ||
    filters.q !== null;

  return requiresRawLogs
    ? buildRawLogAggregateQuery(filters)
    : buildRollupLogAggregateQuery(filters);
}
