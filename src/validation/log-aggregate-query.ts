import type {
    AggregateBucket,
    AggregateGroupBy,
    LogAggregateFilters,
  } from "../domain/log-aggregate.js";
  
  import {
    parseLogQueryParams,
  } from "./log-query.js";
  
  type AggregateQueryParseResult =
    | {
        ok: true;
        value: LogAggregateFilters;
      }
    | {
        ok: false;
        reason: string;
      };
  
  function isAggregateBucket(
    value: string,
  ): value is AggregateBucket {
    return (
      value === "1m" ||
      value === "5m" ||
      value === "1h" ||
      value === "1d"
    );
  }
  
  function isAggregateGroupBy(
    value: string,
  ): value is AggregateGroupBy {
    return (
      value === "service" ||
      value === "level"
    );
  }
  
  export function parseLogAggregateQueryParams(
    params: URLSearchParams,
  ): AggregateQueryParseResult {
    const commonParams =
      new URLSearchParams();
  
    let bucket:
      AggregateBucket | null = null;
  
    let groupBy:
      AggregateGroupBy | null = null;
  
    let bucketSeen = false;
    let groupBySeen = false;
  
    for (const [name, value] of params) {
      if (name === "bucket") {
        if (bucketSeen) {
          return {
            ok: false,
            reason:
              "duplicate query parameter: 'bucket'",
          };
        }
  
        bucketSeen = true;
  
        if (!isAggregateBucket(value)) {
          return {
            ok: false,
            reason:
              `invalid bucket: '${value}'`,
          };
        }
  
        bucket = value;
  
        continue;
      }
  
      if (name === "group_by") {
        if (groupBySeen) {
          return {
            ok: false,
            reason:
              "duplicate query parameter: 'group_by'",
          };
        }
  
        groupBySeen = true;
  
        if (!isAggregateGroupBy(value)) {
          return {
            ok: false,
            reason:
              `invalid group_by: '${value}'`,
          };
        }
  
        groupBy = value;
  
        continue;
      }
  
      if (
        name === "limit" ||
        name === "cursor"
      ) {
        return {
          ok: false,
          reason:
            `unsupported aggregation query parameter: '${name}'`,
        };
      }
  
      commonParams.append(
        name,
        value,
      );
    }
  
    const commonResult =
      parseLogQueryParams(
        commonParams,
      );
  
    if (!commonResult.ok) {
      return commonResult;
    }
  
    const common =
      commonResult.value;
  
    if (common.since === null) {
      return {
        ok: false,
        reason:
          "since is required",
      };
    }
  
    if (common.until === null) {
      return {
        ok: false,
        reason:
          "until is required",
      };
    }
  
    if (bucket === null) {
      return {
        ok: false,
        reason:
          "bucket is required",
      };
    }
  
    return {
      ok: true,
      value: {
        service:
          common.service,
  
        level:
          common.level,
  
        since:
          common.since,
  
        until:
          common.until,
  
        attributeFilters:
          common.attributeFilters,
  
        q:
          common.q,
  
        bucket,
  
        groupBy,
      },
    };
  }