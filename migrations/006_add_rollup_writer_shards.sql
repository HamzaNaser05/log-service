ALTER TABLE log_minute_rollups
  DROP CONSTRAINT log_minute_rollups_pkey;

ALTER TABLE log_minute_rollups
  ADD COLUMN writer_shard smallint NOT NULL DEFAULT 0;

ALTER TABLE log_minute_rollups
  ADD CONSTRAINT log_minute_rollups_writer_shard_check
  CHECK (writer_shard >= 0);

ALTER TABLE log_minute_rollups
  ADD CONSTRAINT log_minute_rollups_pkey
  PRIMARY KEY (
    minute_start,
    service,
    level,
    writer_shard
  );
