CREATE SEQUENCE logs_id_seq AS bigint;

CREATE TABLE logs (
  id bigint NOT NULL DEFAULT nextval('logs_id_seq'),

  timestamp timestamptz NOT NULL,

  level text NOT NULL,

  service text NOT NULL,

  message text NOT NULL,

  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT logs_level_check
    CHECK (level IN ('debug', 'info', 'warn', 'error')),

  CONSTRAINT logs_service_nonempty_check
    CHECK (length(service) > 0),

  CONSTRAINT logs_message_nonempty_check
    CHECK (length(message) > 0),

  CONSTRAINT logs_attributes_object_check
    CHECK (jsonb_typeof(attributes) = 'object'),

  CONSTRAINT logs_pkey
    PRIMARY KEY (timestamp, id)
) PARTITION BY RANGE (timestamp);

ALTER SEQUENCE logs_id_seq
  OWNED BY logs.id;

CREATE TABLE logs_2026_08_09
  PARTITION OF logs
  FOR VALUES FROM ('2026-08-09 00:00:00+00')
             TO ('2026-08-10 00:00:00+00');

CREATE INDEX logs_service_timestamp_id_idx
  ON logs (
    service,
    timestamp DESC,
    id DESC
  );