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

import type {
  LogLevel,
} from "../domain/log.js";

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

const ROLLUP_LEVEL_COUNT_COLUMNS:
  Record<LogLevel, string> = {
    debug: "rollup.debug_count",
    info: "rollup.info_count",
    warn: "rollup.warn_count",
    error: "rollup.error_count",
  };

const LEVEL_SQL_LITERALS:
  Record<LogLevel, string> = {
    debug: "'debug'::text",
    info: "'info'::text",
    warn: "'warn'::text",
    error: "'error'::text",
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

  let rollupLevelExpression =
    "NULL::text";

  let rollupCountExpression =
    `
      rollup.debug_count +
      rollup.info_count +
      rollup.warn_count +
      rollup.error_count
    `.trim();

  let rollupExpansionSql = "";
  let rollupPositiveCountSql = "";

  if (filters.level !== null) {
    const countColumn =
      ROLLUP_LEVEL_COUNT_COLUMNS[
        filters.level
      ];

    rollupCountExpression =
      countColumn;

    rollupPositiveCountSql =
      `\n    AND ${countColumn} > 0`;

    if (filters.groupBy === "level") {
      rollupLevelExpression =
        LEVEL_SQL_LITERALS[
          filters.level
        ];
    }
  } else if (
    filters.groupBy === "level"
  ) {
    rollupLevelExpression =
      "expanded.level";

    rollupCountExpression =
      "expanded.log_count";

    rollupExpansionSql = `
  CROSS JOIN LATERAL (
    VALUES
      ('debug'::text, rollup.debug_count),
      ('info'::text, rollup.info_count),
      ('warn'::text, rollup.warn_count),
      ('error'::text, rollup.error_count)
  ) AS expanded (level, log_count)`;

    rollupPositiveCountSql =
      "\n    AND expanded.log_count > 0";
  }

  const rawLevelExpression =
    filters.groupBy === "level"
      ? "log.level"
      : "NULL::text";

  const rawLevelGroupSql =
    filters.groupBy === "level"
      ? ",\n    log.level"
      : "";

  return {
    text: `
WITH bounds AS (
  SELECT
    ${sinceParameter}::timestamptz AS since_time,
    ${untilParameter}::timestamptz AS until_time,
    CASE
      WHEN ${sinceParameter}::timestamptz =
        date_trunc('second', ${sinceParameter}::timestamptz)
      THEN ${sinceParameter}::timestamptz
      ELSE date_trunc('second', ${sinceParameter}::timestamptz) +
        INTERVAL '1 second'
    END AS full_start,
    date_trunc('second', ${untilParameter}::timestamptz) AS full_end
),
second_counts AS (
  SELECT
    rollup.second_start,
    rollup.service,
    ${rollupLevelExpression} AS level,
    ${rollupCountExpression} AS log_count
  FROM log_second_rollups AS rollup${rollupExpansionSql}
  CROSS JOIN bounds
  WHERE bounds.full_start < bounds.full_end
    AND rollup.second_start >= bounds.full_start
    AND rollup.second_start < bounds.full_end${rollupDimensionSql}${rollupPositiveCountSql}

  UNION ALL

  SELECT
    date_trunc('second', log.timestamp) AS second_start,
    log.service,
    ${rawLevelExpression} AS level,
    count(*)::bigint AS log_count
  FROM logs AS log
  CROSS JOIN bounds
  WHERE log.timestamp >= bounds.since_time
    AND log.timestamp < LEAST(
      bounds.full_start,
      bounds.until_time
    )${rawDimensionSql}
  GROUP BY
    date_trunc('second', log.timestamp),
    log.service${rawLevelGroupSql}

  UNION ALL

  SELECT
    date_trunc('second', log.timestamp) AS second_start,
    log.service,
    ${rawLevelExpression} AS level,
    count(*)::bigint AS log_count
  FROM logs AS log
  CROSS JOIN bounds
  WHERE bounds.full_start <= bounds.full_end
    AND log.timestamp >= GREATEST(
      bounds.full_end,
      bounds.since_time
    )
    AND log.timestamp < bounds.until_time${rawDimensionSql}
  GROUP BY
    date_trunc('second', log.timestamp),
    log.service${rawLevelGroupSql}
),
bucketed AS (
  SELECT
    date_bin(
      ${bucketParameter}::interval,
      second_start,
      TIMESTAMPTZ '1970-01-01 00:00:00+00'
    ) AS bucket_start,
    ${groupExpression} AS group_value,
    sum(log_count)::bigint AS log_count
  FROM second_counts
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
