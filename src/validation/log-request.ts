type LogBatchRequestResult =
    | {
        ok: true;
        logs: readonly unknown[];
    }
    | {
        ok: false;
        reason: string;
    }

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    )
}

export function parseLogBatchRequest(
    body: unknown,
): LogBatchRequestResult {
    if (!isRecord(body)) {
        return {
            ok: false,
            reason: "request body must be an object"
        }
    }
    if (!Array.isArray(body.logs)) {
        return {
            ok: false,
            reason: "logs must be an array"
        }
    }
    if (body.logs.length === 0) {
        return {
            ok: false,
            reason: "logs must contain at least one entry"
        }
    }

    return {
        ok: true,
        logs: body.logs,
    }
}