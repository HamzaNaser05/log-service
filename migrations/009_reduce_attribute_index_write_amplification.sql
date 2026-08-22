DROP INDEX logs_attributes_normalized_gin_idx;

CREATE INDEX logs_attributes_searchable_gin_idx
  ON logs
  USING GIN (
    (
      attributes_normalized -
      'request_id' -
      'user_id'
    ) jsonb_path_ops
  );
