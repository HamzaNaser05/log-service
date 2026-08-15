CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX logs_message_trgm_idx
ON logs
USING GIN (message gin_trgm_ops);
