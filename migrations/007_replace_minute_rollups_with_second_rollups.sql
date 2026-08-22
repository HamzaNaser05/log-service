CREATE TABLE log_second_rollups (
  second_start timestamptz NOT NULL,
  service text NOT NULL,
  debug_count bigint NOT NULL,
  info_count bigint NOT NULL,
  warn_count bigint NOT NULL,
  error_count bigint NOT NULL,
  writer_shard smallint NOT NULL DEFAULT 0,

  CONSTRAINT log_second_rollups_pkey
    PRIMARY KEY (
      second_start,
      service,
      writer_shard
    ),

  CONSTRAINT log_second_rollups_count_check
    CHECK (
      debug_count >= 0 AND
      info_count >= 0 AND
      warn_count >= 0 AND
      error_count >= 0
    ),

  CONSTRAINT log_second_rollups_writer_shard_check
    CHECK (writer_shard >= 0)
);

INSERT INTO log_second_rollups (
  second_start,
  service,
  debug_count,
  info_count,
  warn_count,
  error_count,
  writer_shard
)
SELECT
  date_trunc('second', timestamp),
  service,
  count(*) FILTER (WHERE level = 'debug'),
  count(*) FILTER (WHERE level = 'info'),
  count(*) FILTER (WHERE level = 'warn'),
  count(*) FILTER (WHERE level = 'error'),
  0
FROM logs
GROUP BY
  date_trunc('second', timestamp),
  service;

DROP TABLE log_minute_rollups;
