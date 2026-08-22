import type {
  PoolClient,
} from "pg";

import type {
  LogLevel,
  ValidatedLogEntry,
} from "../domain/log.js";

export type MinuteRollupEntry = {
  minuteStart: string;
  service: string;
  level: LogLevel;
  count: number;
};

function toMinuteStart(
  epochMilliseconds: number,
): string {
  const minuteMs =
    Math.floor(
      epochMilliseconds / 60_000,
    ) * 60_000;

  return new Date(
    minuteMs,
  ).toISOString();
}

export function buildMinuteRollups(
  logs: readonly ValidatedLogEntry[],
): MinuteRollupEntry[] {
  const rollups =
    new Map<
      number,
      Map<
        string,
        Map<
          LogLevel,
          number
        >
      >
    >();

  for (const log of logs) {
    const minuteEpoch =
      Math.floor(
        (
          log.epochMilliseconds ??
          Date.parse(log.timestamp)
        ) / 60_000,
      ) * 60_000;

    let services =
      rollups.get(minuteEpoch);

    if (services === undefined) {
      services = new Map();
      rollups.set(
        minuteEpoch,
        services,
      );
    }

    let levels =
      services.get(log.service);

    if (levels === undefined) {
      levels = new Map();
      services.set(
        log.service,
        levels,
      );
    }

    levels.set(
      log.level,
      (levels.get(log.level) ?? 0) + 1,
    );
  }

  const entries:
    MinuteRollupEntry[] = [];

  for (
    const [minuteEpoch, services]
    of rollups
  ) {
    const minuteStart =
      toMinuteStart(
        minuteEpoch,
      );

    for (
      const [service, levels]
      of services
    ) {
      for (
        const [level, count]
        of levels
      ) {
        entries.push({
          minuteStart,
          service,
          level,
          count,
        });
      }
    }
  }

  return entries;
}

export async function upsertMinuteRollups(
  client: PoolClient,
  logs: readonly ValidatedLogEntry[],
  writerShard = 0,
): Promise<void> {
  const rollups =
    buildMinuteRollups(logs);

  if (rollups.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO log_minute_rollups (
        minute_start,
        service,
        level,
        log_count,
        writer_shard
      )
      SELECT
        minute_start,
        service,
        level,
        log_count,
        $5::smallint
      FROM unnest(
        $1::timestamptz[],
        $2::text[],
        $3::text[],
        $4::bigint[]
      ) AS batch (
        minute_start,
        service,
        level,
        log_count
      )
      ON CONFLICT (
        minute_start,
        service,
        level,
        writer_shard
      )
      DO UPDATE SET
        log_count =
          log_minute_rollups.log_count +
          EXCLUDED.log_count
    `,
    [
      rollups.map(
        (rollup) => rollup.minuteStart,
      ),
      rollups.map(
        (rollup) => rollup.service,
      ),
      rollups.map(
        (rollup) => rollup.level,
      ),
      rollups.map(
        (rollup) => rollup.count,
      ),
      writerShard,
    ],
  );
}
