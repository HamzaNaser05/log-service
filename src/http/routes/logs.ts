import type {
    FastifyInstance,
} from "fastify";

import type {
    Pool,
} from "pg";

import { insertLogs } from "../../persistence/log-repository.js";
import { validateLogBatch } from "../../validation/log-entry.js";
import { parseLogBatchRequest } from "../../validation/log-request.js";

export function registerLogsRoute(
    server: FastifyInstance,
    pool: Pool,
): void {
    server.post("/logs",
        async (request, reply) => {
            const body: unknown = request.body;

            const requestResult =
                parseLogBatchRequest(body);

            if (!requestResult.ok) {
                return reply.code(400).send({
                    error: requestResult.reason,
                })
            }

            const validationResult =
                validateLogBatch(
                    requestResult.logs,
                )

            if (validationResult.accepted.length === 0) {
                return reply.code(400).send({
                    accepted: 0,
                    rejected: validationResult.rejected,
                })
            }

            const logsToInsert =
                validationResult.accepted.map(
                    ({ log }) => log,
                )
            try {
                const acceptedCount =
                    await insertLogs(
                        pool,
                        logsToInsert,
                    )
                return reply.code(200).send({
                    accepted: acceptedCount,
                    rejected: validationResult.rejected
                })
            } catch (error: unknown) {
                request.log.error({
                    err: error,
                    acceptedCandidateCount: logsToInsert.length,
                },
                    "Log ingestion failed"
                )
                return reply.code(503).send({
                    error: "log ingestion unavailable"
                })
            }
        }
    )
}