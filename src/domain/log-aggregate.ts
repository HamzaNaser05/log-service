import type {
    LogFilterSet,
  } from "./log-query.js";
  
  export type AggregateBucket =
    | "1m"
    | "5m"
    | "1h"
    | "1d";
  
  export type AggregateGroupBy =
    | "service"
    | "level";
  
  export type LogAggregateFilters =
    LogFilterSet & {
      bucket: AggregateBucket;
      groupBy:
        AggregateGroupBy | null;
    };
  
  export type LogAggregateBucketResult = {
    start: string;
    group: string | null;
    count: number;
  };