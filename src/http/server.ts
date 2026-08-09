import Fastify from "fastify";

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

import { registerHealthRoute } from "./routes/health.js";

export function buildServer(
    pool: Pool
) {
    const server = Fastify({
        logger: true
    });

    registerHealthRoute(server, pool)
    
    return server;
}