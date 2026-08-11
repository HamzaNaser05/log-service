import Fastify from "fastify";

import type {
  FastifyInstance,
} from "fastify";

import type {
  Pool,
} from "pg";

import {
  IngestionAdmissionController,
} from "../ingestion/admission-controller.js";

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

  ingestionAdmission:
    IngestionAdmissionController =
      new IngestionAdmissionController(
        4,
        1,
      ),
): FastifyInstance {
  const server =
    Fastify({
      logger,

      /*
       * Fastify's default behavior
       * during close is already to
       * reject newly arriving
       * requests with HTTP 503.
       */
      return503OnClosing: true,
    });

  registerHealthRoute(
    server,
    pool,
  );

  registerLogsRoute(
    server,
    pool,
    ingestionAdmission,
  );

  registerLogAggregateRoute(
    server,
    pool,
  );

  return server;
}