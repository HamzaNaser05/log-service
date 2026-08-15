export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogAttributeValue = string | number | boolean;

export type LogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Record<string, LogAttributeValue>;
};

export type HealthResponse = {
  status: string;
};

export type LogsResponse = {
  logs: LogEntry[];
  next_cursor: string | null;
};

export type AggregateBucket = "1m" | "5m" | "1h" | "1d";
export type AggregateGroupBy = "service" | "level";

export type AggregatePoint = {
  start: string;
  group: string | null;
  count: number;
};

export type AggregateResponse = {
  buckets: AggregatePoint[];
};

export type AttributeFilter = {
  key: string;
  value: string;
};

export type CommonLogFilters = {
  service?: string;
  level?: LogLevel;
  since?: string;
  until?: string;
  query?: string;
  attributes?: AttributeFilter[];
};

export type LogsQuery = CommonLogFilters & {
  limit?: number;
  cursor?: string;
};

export type AggregateQuery = CommonLogFilters & {
  since: string;
  until: string;
  bucket: AggregateBucket;
  groupBy?: AggregateGroupBy;
};
