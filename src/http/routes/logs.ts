import type {
  FastifyInstance,
} from "fastify";

import type {
  Pool,
} from "pg";

import type {
  LogIngestionQueue,
} from "../../ingestion/log-ingestion-queue.js";

import {
  queryLogs,
} from "../../persistence/log-query-repository.js";


import {
  decodeLogCursor,
} from "../../query/log-cursor.js";

import type {
  LogCursor,
} from "../../query/log-cursor.js";

import {
  validateLogBatch,
} from "../../validation/log-entry.js";

import {
  parseLogQueryParams,
} from "../../validation/log-query.js";

import {
  parseLogBatchRequest,
} from "../../validation/log-request.js";

export function registerLogsRoute(
  server: FastifyInstance,
  pool: Pool,
  ingestionQueue:
    LogIngestionQueue,
): void {
  server.post(
    "/logs",
    async (
      request,
      reply,
    ) => {
      const body: unknown =
        request.body;

      const requestResult =
        parseLogBatchRequest(
          body,
        );

      if (!requestResult.ok) {
        return reply
          .code(400)
          .send({
            error:
              requestResult.reason,
          });
      }

      const validationResult =
        validateLogBatch(
          requestResult.logs,
        );

      if (
        validationResult
          .accepted.length === 0
      ) {
        return reply
          .code(400)
          .send({
            accepted: 0,

            rejected:
              validationResult
                .rejected,
          });
      }

      const logsToInsert =
        validationResult
          .accepted
          .map(
            ({ log }) => log,
          );

      /*
       * Validation is cheap and does
       * not hold a DB connection.
       *
       * Only valid batches compete
       * for an ingestion permit.
       */
      const enqueueResult =
        ingestionQueue.enqueue(
          logsToInsert,
        );

      if (!enqueueResult.ok) {
        if (
          enqueueResult.reason ===
          "full"
        ) {
          reply.header(
            "Retry-After",

            String(
              ingestionQueue
                .retryAfterSeconds,
            ),
          );

          return reply
            .code(503)
            .send({
              error:
                "log ingestion busy",
            });
        }

        return reply
          .code(503)
          .send({
            error:
              "log ingestion unavailable",
          });
      }

      try {
        const acceptedCount =
          await enqueueResult
            .completion;

        return reply
          .code(200)
          .send({
            accepted:
              acceptedCount,

            rejected:
              validationResult
                .rejected,
          });
      } catch (
      error: unknown
      ) {
        request.log.error(
          {
            err: error,

            acceptedCandidateCount:
              logsToInsert.length,
          },

          "Log ingestion failed",
        );

        return reply
          .code(503)
          .send({
            error:
              "log ingestion unavailable",
          });
      }
    },
  );

  server.get(
    "/logs",
    async (
      request,
      reply,
    ) => {
      const requestUrl =
        new URL(
          request.url,
          "http://localhost",
        );

      const queryResult =
        parseLogQueryParams(
          requestUrl.searchParams,
        );

      if (!queryResult.ok) {
        return reply
          .code(400)
          .send({
            error:
              queryResult.reason,
          });
      }

      const filters =
        queryResult.value;

      let decodedCursor:
        LogCursor | null = null;

      if (
        filters.cursor !== null
      ) {
        const cursorResult =
          decodeLogCursor(
            filters.cursor,
          );

        if (!cursorResult.ok) {
          return reply
            .code(400)
            .send({
              error:
                "invalid cursor",
            });
        }

        decodedCursor =
          cursorResult.value;
      }

      try {
        const result =
          await queryLogs(
            pool,
            filters,
            decodedCursor,
          );

        return reply
          .code(200)
          .send({
            logs:
              result.logs,

            next_cursor:
              result.nextCursor,
          });
      } catch (
      error: unknown
      ) {
        request.log.error(
          {
            err: error,
          },

          "Log query failed",
        );

        return reply
          .code(503)
          .send({
            error:
              "log query unavailable",
          });
      }
    },
  );
}