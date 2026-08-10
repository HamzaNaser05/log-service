import type {
    Pool,
  } from "pg";
  
  import type {
    LogAggregateBucketResult,
    LogAggregateFilters,
  } from "../domain/log-aggregate.js";
  
  import {
    buildLogAggregateQuery,
  } from "../query/log-aggregate-query.js";
  
  type AggregateRow = {
    start: string;
    group: string | null;
    count: string;
  };
  
  const MAX_SAFE_COUNT =
    BigInt(
      Number.MAX_SAFE_INTEGER,
    );
  
  function parseCount(
    value: string,
  ): number {
    if (!/^\d+$/.test(value)) {
      throw new Error(
        `Invalid aggregate count returned by PostgreSQL: ${value}`,
      );
    }
  
    const count = BigInt(value);
  
    if (count > MAX_SAFE_COUNT) {
      throw new Error(
        "Aggregate count exceeds JavaScript safe integer range",
      );
    }
  
    return Number(count);
  }
  
  export async function aggregateLogs(
    pool: Pool,
    filters: LogAggregateFilters,
  ): Promise<
    LogAggregateBucketResult[]
  > {
    const query =
      buildLogAggregateQuery(
        filters,
      );
  
    const result =
      await pool.query<AggregateRow>(
        query.text,
        query.values,
      );
  
    return result.rows.map(
      (row) => ({
        start: row.start,
        group: row.group,
        count:
          parseCount(row.count),
      }),
    );
  }