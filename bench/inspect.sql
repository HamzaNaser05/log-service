\timing on

ANALYZE logs;


-- Total rows.
SELECT
  count(*) AS total_logs
FROM logs;


-- Total database size.
SELECT
  pg_size_pretty(
    pg_database_size(
      current_database()
    )
  ) AS database_size;


-- Combined partition data/index sizes.
SELECT
  pg_size_pretty(
    COALESCE(
      sum(
        pg_table_size(
          child.oid
        )
      ),
      0
    )::bigint
  ) AS table_size,

  pg_size_pretty(
    COALESCE(
      sum(
        pg_indexes_size(
          child.oid
        )
      ),
      0
    )::bigint
  ) AS indexes_size,

  pg_size_pretty(
    COALESCE(
      sum(
        pg_total_relation_size(
          child.oid
        )
      ),
      0
    )::bigint
  ) AS total_relation_size

FROM pg_inherits AS inheritance

JOIN pg_class AS child
  ON child.oid =
     inheritance.inhrelid

WHERE
  inheritance.inhparent =
    'logs'::regclass;


-- Individual index sizes.
SELECT
  relname AS partition,

  indexrelname AS index_name,

  pg_size_pretty(
    pg_relation_size(
      indexrelid
    )
  ) AS index_size

FROM pg_stat_user_indexes

WHERE
  relname LIKE
    'logs_%'

ORDER BY
  pg_relation_size(
    indexrelid
  ) DESC;


-- Service + keyset-shaped query.
EXPLAIN (
  ANALYZE,
  BUFFERS
)
SELECT
  id,
  timestamp,
  level,
  service,
  message,
  attributes

FROM logs

WHERE
  timestamp >=
    now() - interval '2 hours'

  AND service =
    'checkout'

ORDER BY
  timestamp DESC,
  id DESC

LIMIT 100;


-- Arbitrary attribute equality.
EXPLAIN (
  ANALYZE,
  BUFFERS
)
SELECT
  id,
  timestamp,
  service

FROM logs

WHERE
  timestamp >=
    now() - interval '2 hours'

  AND attributes_normalized
    @> '{"region":"eu-west"}'::jsonb

ORDER BY
  timestamp DESC,
  id DESC

LIMIT 100;


-- Aggregation plan.
EXPLAIN (
  ANALYZE,
  BUFFERS
)
SELECT
  date_bin(
    '5 minutes'::interval,
    timestamp,
    TIMESTAMPTZ
      '1970-01-01 00:00:00+00'
  ) AS bucket,

  service,

  count(*)

FROM logs

WHERE
  timestamp >=
    now() - interval '2 hours'

GROUP BY
  bucket,
  service

ORDER BY
  bucket,
  service;