\timing on


-- =========================================================
-- 1. DURABILITY
-- =========================================================

SELECT
  name,
  setting,
  unit

FROM pg_settings

WHERE name IN (
  'fsync',
  'synchronous_commit',
  'full_page_writes'
)

ORDER BY name;


-- =========================================================
-- 2. IMPORTANT POSTGRES SETTINGS
-- =========================================================

SELECT
  name,
  setting,
  unit

FROM pg_settings

WHERE name IN (
  'shared_buffers',
  'effective_cache_size',
  'work_mem',
  'maintenance_work_mem',
  'max_wal_size',
  'checkpoint_timeout',
  'gin_pending_list_limit'
)

ORDER BY name;


-- =========================================================
-- 3. DATABASE CACHE / ACTIVITY
-- =========================================================

SELECT
  datname,

  numbackends,

  xact_commit,
  xact_rollback,

  blks_read,
  blks_hit,

  CASE
    WHEN
      blks_hit + blks_read = 0
    THEN NULL

    ELSE round(
      (
        100.0 *
        blks_hit /
        (
          blks_hit +
          blks_read
        )
      )::numeric,
      2
    )
  END AS buffer_hit_percent,

  temp_files,

  pg_size_pretty(
    temp_bytes
  ) AS temp_data,

  deadlocks

FROM pg_stat_database

WHERE datname =
  current_database();


-- =========================================================
-- 4. WAL
-- =========================================================

SELECT
  wal_records,

  wal_fpi,

  pg_size_pretty(
    wal_bytes::bigint
  ) AS wal_generated,

  wal_buffers_full,

  wal_write,

  wal_sync

FROM pg_stat_wal;


-- =========================================================
-- 5. TABLE STATISTICS
-- =========================================================

SELECT
  relname,

  seq_scan,
  seq_tup_read,

  idx_scan,
  idx_tup_fetch,

  n_tup_ins,

  n_live_tup,
  n_dead_tup,

  last_vacuum,
  last_autovacuum,

  last_analyze,
  last_autoanalyze

FROM pg_stat_user_tables

WHERE
  relname LIKE 'logs_%'

ORDER BY relname;


-- =========================================================
-- 6. INDEX USAGE + INDEX TYPE + SIZE
-- =========================================================

SELECT
  statistics.relname
    AS partition,

  statistics.indexrelname
    AS index_name,

  access_method.amname
    AS index_type,

  statistics.idx_scan,

  statistics.idx_tup_read,

  statistics.idx_tup_fetch,

  pg_size_pretty(
    pg_relation_size(
      statistics.indexrelid
    )
  ) AS index_size

FROM pg_stat_user_indexes
  AS statistics

JOIN pg_class
  AS index_class

  ON
    index_class.oid =
      statistics.indexrelid

JOIN pg_am
  AS access_method

  ON
    access_method.oid =
      index_class.relam

WHERE
  statistics.relname
    LIKE 'logs_%'

ORDER BY
  pg_relation_size(
    statistics.indexrelid
  ) DESC;


-- =========================================================
-- 7. TOTAL DATA + INDEX SIZE
-- =========================================================

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

FROM pg_inherits
  AS inheritance

JOIN pg_class
  AS child

  ON
    child.oid =
      inheritance.inhrelid

WHERE
  inheritance.inhparent =
    'logs'::regclass;


-- =========================================================
-- 8. POSTGRESQL 16 I/O
-- =========================================================

SELECT
  backend_type,
  object,
  context,

  reads,
  writes,
  extends,
  fsyncs,

  read_time,
  write_time,
  fsync_time

FROM pg_stat_io

WHERE
  reads > 0

  OR writes > 0

  OR extends > 0

  OR fsyncs > 0

ORDER BY
  backend_type,
  object,
  context;