import type {
  PoolClient,
} from "pg";

import type {
  LogLevel,
  ValidatedLogEntry,
} from "../domain/log.js";

export type SecondRollupEntry = {
  secondStart: string;
  service: string;
  debugCount: number;
  infoCount: number;
  warnCount: number;
  errorCount: number;
};

type LevelCounts =
  Record<LogLevel, number>;

function createLevelCounts():
  LevelCounts {
  return {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
  };
}

function toSecondStart(
  epochMilliseconds: number,
): string {
  const secondMs =
    Math.floor(
      epochMilliseconds / 1_000,
    ) * 1_000;

  return new Date(
    secondMs,
  ).toISOString();
}

export function buildSecondRollups(
  logs: readonly ValidatedLogEntry[],
): SecondRollupEntry[] {
  const rollups =
    new Map<
      number,
      Map<
        string,
        LevelCounts
      >
    >();

  for (const log of logs) {
    const secondEpoch =
      Math.floor(
        (
          log.epochMilliseconds ??
          Date.parse(log.timestamp)
        ) / 1_000,
      ) * 1_000;

    let services =
      rollups.get(secondEpoch);

    if (services === undefined) {
      services = new Map();
      rollups.set(
        secondEpoch,
        services,
      );
    }

    let counts =
      services.get(log.service);

    if (counts === undefined) {
      counts = createLevelCounts();
      services.set(
        log.service,
        counts,
      );
    }

    counts[log.level] += 1;
  }

  const entries:
    SecondRollupEntry[] = [];

  for (
    const [secondEpoch, services]
    of rollups
  ) {
    const secondStart =
      toSecondStart(
        secondEpoch,
      );

    for (
      const [service, counts]
      of services
    ) {
      entries.push({
        secondStart,
        service,
        debugCount: counts.debug,
        infoCount: counts.info,
        warnCount: counts.warn,
        errorCount: counts.error,
      });
    }
  }

  return entries;
}

export async function upsertSecondRollups(
  client: PoolClient,
  logs: readonly ValidatedLogEntry[],
  writerShard = 0,
): Promise<void> {
  const rollups =
    buildSecondRollups(logs);

  if (rollups.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO log_second_rollups (
        second_start,
        service,
        debug_count,
        info_count,
        warn_count,
        error_count,
        writer_shard
      )
      SELECT
        second_start,
        service,
        debug_count,
        info_count,
        warn_count,
        error_count,
        $7::smallint
      FROM unnest(
        $1::timestamptz[],
        $2::text[],
        $3::bigint[],
        $4::bigint[],
        $5::bigint[],
        $6::bigint[]
      ) AS batch (
        second_start,
        service,
        debug_count,
        info_count,
        warn_count,
        error_count
      )
      ON CONFLICT (
        second_start,
        service,
        writer_shard
      )
      DO UPDATE SET
        debug_count =
          log_second_rollups.debug_count +
          EXCLUDED.debug_count,
        info_count =
          log_second_rollups.info_count +
          EXCLUDED.info_count,
        warn_count =
          log_second_rollups.warn_count +
          EXCLUDED.warn_count,
        error_count =
          log_second_rollups.error_count +
          EXCLUDED.error_count
    `,
    [
      rollups.map(
        (rollup) => rollup.secondStart,
      ),
      rollups.map(
        (rollup) => rollup.service,
      ),
      rollups.map(
        (rollup) => rollup.debugCount,
      ),
      rollups.map(
        (rollup) => rollup.infoCount,
      ),
      rollups.map(
        (rollup) => rollup.warnCount,
      ),
      rollups.map(
        (rollup) => rollup.errorCount,
      ),
      writerShard,
    ],
  );
}
