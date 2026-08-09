import type { FastifyInstance } from "fastify";
import type { Pool } from "pg"

export function registerHealthRoute(
    server: FastifyInstance,
    pool: Pool
) {
    server.get("/health", async (request, reply) => {
        try {
            await pool.query("SELECT 1")

            return reply.code(200).send({
                status: "ok"
            })
        } catch (error: unknown) {
            request.log.error(
                { err: error },
                "Health check failed"
            )
            return reply.code(503).send({
                status: "Unavailable"
            })
        }
    })
}