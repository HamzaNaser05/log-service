import type {
    FastifyInstance,
  } from "fastify";
  
  import type {
    Pool,
  } from "pg";
  
  import {
    aggregateLogs,
  } from "../../persistence/log-aggregate-repository.js";
  
  import {
    parseLogAggregateQueryParams,
  } from "../../validation/log-aggregate-query.js";
  
  export function registerLogAggregateRoute(
    server: FastifyInstance,
    pool: Pool,
  ): void {
    server.get(
      "/logs/aggregate",
      async (request, reply) => {
        const requestUrl =
          new URL(
            request.url,
            "http://localhost",
          );
  
        const queryResult =
          parseLogAggregateQueryParams(
            requestUrl.searchParams,
          );
  
        if (!queryResult.ok) {
          return reply.code(400).send({
            error:
              queryResult.reason,
          });
        }
  
        try {
          const buckets =
            await aggregateLogs(
              pool,
              queryResult.value,
            );
  
          return reply.code(200).send({
            buckets,
          });
        } catch (error: unknown) {
          request.log.error(
            {
              err: error,
            },
            "Log aggregation failed",
          );
  
          return reply.code(503).send({
            error:
              "log aggregation unavailable",
          });
        }
      },
    );
  }