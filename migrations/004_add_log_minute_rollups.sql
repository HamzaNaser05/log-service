CREATE TABLE log_minute_rollups (
  minute_start timestamptz NOT NULL,
  service text NOT NULL,
  level text NOT NULL,
  log_count bigint NOT NULL,

  CONSTRAINT log_minute_rollups_pkey
    PRIMARY KEY (
      minute_start,
      service,
      level
    ),

  CONSTRAINT log_minute_rollups_level_check
    CHECK (
      level IN (
        'debug',
        'info',
        'warn',
        'error'
      )
    ),

  CONSTRAINT log_minute_rollups_count_check
    CHECK (log_count >= 0)
);
