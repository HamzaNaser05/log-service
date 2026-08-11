import type {
    PoolClient,
  } from "pg";
  
  import {
    addUtcDays,
    logPartitionNameForDay,
    parseManagedLogPartitionName,
    startOfUtcDay,
  } from "./utc-day.js";
  
  type ExistsRow = {
    exists: boolean;
  };
  
  type PartitionNameRow = {
    name: string;
  };
  
  export type ManagedLogPartition = {
    name: string;
    day: Date;
  };
  
  export async function logPartitionExists(
    client: PoolClient,
    partitionName: string,
  ): Promise<boolean> {
    const result =
      await client.query<ExistsRow>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_inherits AS inheritance
            JOIN pg_class AS child
              ON child.oid =
                 inheritance.inhrelid
            WHERE
              inheritance.inhparent =
                'logs'::regclass
              AND child.relname = $1
          ) AS "exists"
        `,
        [partitionName],
      );
  
    const row = result.rows[0];
  
    if (row === undefined) {
      throw new Error(
        "Failed to inspect log partitions",
      );
    }
  
    return row.exists;
  }
  
  export async function ensureLogPartition(
    client: PoolClient,
    date: Date,
  ): Promise<boolean> {
    const day =
      startOfUtcDay(date);
  
    const partitionName =
      logPartitionNameForDay(day);
  
    if (
      await logPartitionExists(
        client,
        partitionName,
      )
    ) {
      return false;
    }
  
    const nextDay =
      addUtcDays(day, 1);
  
    const start =
      day.toISOString();
  
    const end =
      nextDay.toISOString();
  
    /*
     * The identifier and bounds below
     * are generated entirely by our
     * application from validated UTC
     * dates. No user input is inserted
     * into this SQL text.
     */
    await client.query(
      `
        CREATE TABLE ${partitionName}
          PARTITION OF logs
          FOR VALUES
          FROM ('${start}')
          TO ('${end}')
      `,
    );
  
    return true;
  }
  
  export async function ensureLogPartitionWindow(
    client: PoolClient,
    cutoff: Date,
    now: Date,
    aheadDays: number,
  ): Promise<string[]> {
    const firstDay =
      startOfUtcDay(cutoff);
  
    const lastDay =
      addUtcDays(
        startOfUtcDay(now),
        aheadDays,
      );
  
    const created: string[] = [];
  
    for (
      let day = firstDay;
      day.getTime() <=
        lastDay.getTime();
      day = addUtcDays(day, 1)
    ) {
      const wasCreated =
        await ensureLogPartition(
          client,
          day,
        );
  
      if (wasCreated) {
        created.push(
          logPartitionNameForDay(
            day,
          ),
        );
      }
    }
  
    return created;
  }
  
  export async function listManagedLogPartitions(
    client: PoolClient,
  ): Promise<
    ManagedLogPartition[]
  > {
    const result =
      await client.query<
        PartitionNameRow
      >(
        `
          SELECT
            child.relname AS name
          FROM pg_inherits
            AS inheritance
          JOIN pg_class AS child
            ON child.oid =
               inheritance.inhrelid
          WHERE
            inheritance.inhparent =
              'logs'::regclass
        `,
      );
  
    const partitions:
      ManagedLogPartition[] = [];
  
    for (const row of result.rows) {
      const day =
        parseManagedLogPartitionName(
          row.name,
        );
  
      /*
       * Retention only touches tables
       * following our strict
       * logs_YYYY_MM_DD convention.
       */
      if (day === null) {
        continue;
      }
  
      partitions.push({
        name: row.name,
        day,
      });
    }
  
    partitions.sort(
      (left, right) =>
        left.day.getTime() -
        right.day.getTime(),
    );
  
    return partitions;
  }