ALTER TABLE logs
  ADD COLUMN attributes_normalized jsonb;

UPDATE logs
SET attributes_normalized =
  COALESCE(
    (
      SELECT jsonb_object_agg(
        key,
        to_jsonb(value)
      )
      FROM jsonb_each_text(attributes)
    ),
    '{}'::jsonb
  );

ALTER TABLE logs
  ALTER COLUMN attributes_normalized
  SET NOT NULL;

ALTER TABLE logs
  ADD CONSTRAINT logs_attributes_normalized_object_check
  CHECK (
    jsonb_typeof(attributes_normalized) = 'object'
  );

CREATE INDEX logs_attributes_normalized_gin_idx
  ON logs
  USING GIN (
    attributes_normalized jsonb_path_ops
  );