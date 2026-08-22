import type {
    ValidatedLogEntry,
} from "../domain/log.js";

import type {
    LogBatchWriter,
} from "./log-batch-writer.js";

type QueuedRequest = {
    logs:
    readonly ValidatedLogEntry[];

    resolve:
    (
        acceptedCount: number,
    ) => void;

    reject:
    (
        error: unknown,
    ) => void;
};

export type LogIngestionQueueOptions = {
    maxBufferedLogs: number;

    maxMicrobatchLogs: number;

    flushThresholdLogs: number;

    maxWaitMilliseconds: number;

    retryAfterSeconds: number;

    maxConcurrentFlushes?: number;
};

export type LogEnqueueResult =
    | {
        ok: true;

        completion:
        Promise<number>;
    }
    | {
        ok: false;

        reason:
        "full" | "closed";
    };

export class LogIngestionQueue {
    private readonly queue:
        QueuedRequest[] = [];

    private queuedLogs = 0;

    private inFlightLogs = 0;

    private timer:
        NodeJS.Timeout | null =
        null;

    private readonly flushPromises =
        new Set<Promise<void>>();

    private readonly maxConcurrentFlushes:
        number;

    private closePromise:
        Promise<void> | null =
        null;

    private accepting = true;

    public readonly retryAfterSeconds:
        number;

    public constructor(
        private readonly writer:
            LogBatchWriter,

        private readonly options:
            LogIngestionQueueOptions,
    ) {
        if (
            options.maxBufferedLogs <
            1 ||
            !Number.isInteger(
                options.maxBufferedLogs,
            )
        ) {
            throw new Error(
                "maxBufferedLogs must be a positive integer",
            );
        }

        if (
            options.maxMicrobatchLogs <
            1 ||
            !Number.isInteger(
                options.maxMicrobatchLogs,
            )
        ) {
            throw new Error(
                "maxMicrobatchLogs must be a positive integer",
            );
        }

        if (
            options.maxMicrobatchLogs >
            options.maxBufferedLogs
        ) {
            throw new Error(
                "maxMicrobatchLogs must not exceed maxBufferedLogs",
            );
        }

        if (
            options.maxWaitMilliseconds <
            1 ||
            !Number.isInteger(
                options
                    .maxWaitMilliseconds,
            )
        ) {
            throw new Error(
                "maxWaitMilliseconds must be a positive integer",
            );
        }

        if (
            !Number.isInteger(
                options.flushThresholdLogs,
            ) ||
            options.flushThresholdLogs < 1
        ) {
            throw new Error(
                "flushThresholdLogs must be a positive integer",
            );
        }

        if (
            options.flushThresholdLogs >
            options.maxMicrobatchLogs
        ) {
            throw new Error(
                "flushThresholdLogs must not exceed maxMicrobatchLogs",
            );
        }

        if (
            options.retryAfterSeconds <
            1 ||
            !Number.isInteger(
                options
                    .retryAfterSeconds,
            )
        ) {
            throw new Error(
                "retryAfterSeconds must be a positive integer",
            );
        }

        const maxConcurrentFlushes =
            options.maxConcurrentFlushes ??
            1;

        if (
            maxConcurrentFlushes < 1 ||
            !Number.isInteger(
                maxConcurrentFlushes,
            )
        ) {
            throw new Error(
                "maxConcurrentFlushes must be a positive integer",
            );
        }

        this.maxConcurrentFlushes =
            maxConcurrentFlushes;

        this.retryAfterSeconds =
            options
                .retryAfterSeconds;


    }

    public get bufferedLogCount():
        number {
        return (
            this.queuedLogs +
            this.inFlightLogs
        );
    }

    public async start():
        Promise<void> {
        await this.writer.start();
    }

    public enqueue(
        logs:
            readonly ValidatedLogEntry[],
    ): LogEnqueueResult {
        if (!this.accepting) {
            return {
                ok: false,
                reason: "closed",
            };
        }

        if (
            logs.length === 0
        ) {
            throw new Error(
                "Cannot enqueue an empty log batch",
            );
        }

        if (
            this.bufferedLogCount +
            logs.length >
            this.options
                .maxBufferedLogs
        ) {
            return {
                ok: false,
                reason: "full",
            };
        }

        let resolveCompletion:
            (
                acceptedCount:
                    number,
            ) => void =
            () => { };

        let rejectCompletion:
            (
                error: unknown,
            ) => void =
            () => { };

        const completion =
            new Promise<number>(
                (
                    resolve,
                    reject,
                ) => {
                    resolveCompletion =
                        resolve;

                    rejectCompletion =
                        reject;
                },
            );

        this.queue.push({
            logs,

            resolve:
                resolveCompletion,

            reject:
                rejectCompletion,
        });

        this.queuedLogs +=
            logs.length;

        this.scheduleFlush();

        return {
            ok: true,
            completion,
        };
    }

    private clearFlushTimer():
        void {
        if (
            this.timer === null
        ) {
            return;
        }

        clearTimeout(
            this.timer,
        );

        this.timer = null;
    }

    private scheduleFlush():
        void {
        if (
            this.flushPromises.size >=
            this.maxConcurrentFlushes
        ) {
            return;
        }

        if (
            this.queue.length === 0
        ) {
            return;
        }

        while (
            this.queue.length > 0 &&
            this.flushPromises.size <
                this.maxConcurrentFlushes &&
            (
                !this.accepting ||
                this.queuedLogs >=
                    this.options
                        .flushThresholdLogs
            )
        ) {
            this.clearFlushTimer();

            this.startFlush();
        }

        if (
            this.queue.length === 0 ||
            this.flushPromises.size >=
                this.maxConcurrentFlushes
        ) {
            return;
        }

        if (
            this.timer !== null
        ) {
            return;
        }

        this.timer =
            setTimeout(
                () => {
                    this.timer = null;

                    this.startFlush();
                },

                this.options
                    .maxWaitMilliseconds,
            );

        this.timer.unref();
    }

    private takeMicrobatch():
        QueuedRequest[] {
        const selected:
            QueuedRequest[] = [];

        let selectedLogs = 0;

        while (
            this.queue.length > 0
        ) {
            const next =
                this.queue[0];

            if (
                next === undefined
            ) {
                break;
            }

            if (
                selected.length > 0 &&
                selectedLogs +
                next.logs.length >
                this.options
                    .maxMicrobatchLogs
            ) {
                break;
            }

            this.queue.shift();

            this.queuedLogs -=
                next.logs.length;

            this.inFlightLogs +=
                next.logs.length;

            selectedLogs +=
                next.logs.length;

            selected.push(next);

            if (
                selectedLogs >=
                this.options
                    .maxMicrobatchLogs
            ) {
                break;
            }
        }

        return selected;
    }

    private async flush(
        requests:
            readonly QueuedRequest[],
    ): Promise<void> {
        const logs:
            ValidatedLogEntry[] = [];

        let logCount = 0;

        for (
            const request
            of requests
        ) {
            logCount +=
                request.logs.length;

            logs.push(
                ...request.logs,
            );
        }

        try {
            await this.writer.write(
                logs,
            );

            for (
                const request
                of requests
            ) {
                request.resolve(
                    request.logs.length,
                );
            }
        } catch (
        error: unknown
        ) {
            for (
                const request
                of requests
            ) {
                request.reject(
                    error,
                );
            }
        } finally {
            this.inFlightLogs -=
                logCount;
        }
    }

    private startFlush():
        void {
        if (
            this.flushPromises.size >=
            this.maxConcurrentFlushes ||
            this.queue.length === 0
        ) {
            return;
        }

        this.clearFlushTimer();

        const requests =
            this.takeMicrobatch();

        const running =
            this.flush(
                requests,
            );

        let tracked:
            Promise<void>;

        tracked =
            running.finally(
                () => {
                    this.flushPromises.delete(
                        tracked,
                    );

                    this.scheduleFlush();
                },
            );

        this.flushPromises.add(
            tracked,
        );
    }

    private async drain():
        Promise<void> {
        this.clearFlushTimer();

        while (
            this.queue.length > 0 ||
            this.flushPromises.size > 0
        ) {
            while (
                this.queue.length > 0 &&
                this.flushPromises.size <
                    this.maxConcurrentFlushes
            ) {
                this.startFlush();
            }

            if (
                this.flushPromises.size > 0
            ) {
                await Promise.race(
                    this.flushPromises,
                );
            }
        }
    }

    public close():
        Promise<void> {
        if (
            this.closePromise !==
            null
        ) {
            return this.closePromise;
        }

        this.accepting = false;

        this.closePromise =
            this.drain()
                .then(
                    async () => {
                        await this.writer.close();
                    },
                );

        return this.closePromise;
    }
}
