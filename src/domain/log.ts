export type LogLevel =
    | "debug"
    | "info"
    | "warn"
    | "error";

export type LogAttributeValue =
    | string
    | number
    | boolean;

export type LogAttributes = Record<
    string,
    LogAttributeValue
>

export type ValidatedLogEntry = {
    timestamp: string;
    level: LogLevel;
    service: string;
    message: string;
    attributes: LogAttributes;
}

export type RejectedLogEntry = {
    index: number;
    reason: string;
}

export type ValidatedIndexedLogEntry = {
    index: number;
    log: ValidatedLogEntry;
}

export type ValidatedLogBatch = {
    accepted: ValidatedIndexedLogEntry[];
    rejected: RejectedLogEntry[];
}