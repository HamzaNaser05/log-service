import Fastify from "fastify";

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

import { registerHealthRoute } from "./routes/health.js";
import { registerLogsRoute } from "./routes/logs.js";

export function buildServer(
    pool: Pool,
    logger: boolean = true,
) {
    const server = Fastify({
        logger,
    });

    registerHealthRoute(server, pool)
    registerLogsRoute(server, pool)

    return server;
}