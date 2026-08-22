import Fastify from "fastify";

import cors from "@fastify/cors";

import type {
  FastifyInstance,
} from "fastify";

import type {
  Pool,
} from "pg";

import {
  TextCopyLogWriter,
} from "../ingestion/text-copy-writer.js";

import {
  LogIngestionQueue,
} from "../ingestion/log-ingestion-queue.js";

import {
  registerHealthRoute,
} from "./routes/health.js";

import {
  registerLogAggregateRoute,
} from "./routes/log-aggregate.js";

import {
  registerLogsRoute,
} from "./routes/logs.js";

export function buildServer(
  pool: Pool,

  logger: boolean = true,

  ingestionQueue?:
    LogIngestionQueue,

  corsOrigins:
    readonly string[] = [],

  aggregatePool: Pool = pool,
): FastifyInstance {
  const server =
    Fastify({
      logger:
        logger
          ? {
              level: "warn",
            }
          : false,
      return503OnClosing:
        true,
    });

  if (corsOrigins.length > 0) {
    void server.register(cors, {
      origin: [...corsOrigins],
    });
  }

  const effectiveIngestionQueue =
    ingestionQueue ??
    new LogIngestionQueue(
      new TextCopyLogWriter(
        pool,
      ),
      {
        maxBufferedLogs: 10_000,

        maxMicrobatchLogs: 1_000,

        flushThresholdLogs: 400,

        maxWaitMilliseconds: 5,

        retryAfterSeconds: 1,
      },
    );

  registerHealthRoute(
    server,
    pool,
  );

  registerLogsRoute(
    server,
    pool,
    effectiveIngestionQueue,
  );

  registerLogAggregateRoute(
    server,
    aggregatePool,
  );

  server.addHook(
    "onClose",

    async () => {
      await effectiveIngestionQueue
        .close();
    },
  );

  return server;
}
