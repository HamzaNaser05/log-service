INSERT INTO log_minute_rollups (
  minute_start,
  service,
  level,
  log_count
)
SELECT
  date_trunc('minute', timestamp),
  service,
  level,
  count(*)
FROM logs
GROUP BY
  date_trunc('minute', timestamp),
  service,
  level
ON CONFLICT (
  minute_start,
  service,
  level
)
DO UPDATE SET
  log_count = EXCLUDED.log_count;
