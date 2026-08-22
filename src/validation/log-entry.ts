import type {
    LogAttributes,
    LogLevel,
    ValidatedLogBatch,
    ValidatedLogEntry,
  } from "../domain/log.js";
  
  import { parseIsoTimestamp } from "./iso-timestamp.js";
  import type { ParsedIsoTimestamp } from "./iso-timestamp.js";

  type ParseResult<T> =
    | {
        ok: true;
        value: T;
      }
    | {
        ok: false;
        reason: string;
      };

  
  const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
  

  function isRecord(
    value: unknown,
  ): value is Record<string, unknown> {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }
  
  function isLogLevel(
    value: unknown,
  ): value is LogLevel {
    return (
      value === "debug" ||
      value === "info" ||
      value === "warn" ||
      value === "error"
    );
  }
    
  function parseTimestamp(
    value: unknown,
    now: Date,
  ): ParseResult<ParsedIsoTimestamp> {
    const result = parseIsoTimestamp(
      value,
      "timestamp",
    );
  
    if (!result.ok) {
      return result;
    }
  
    if (
      result.value.epochMilliseconds >
      now.getTime() + FIVE_MINUTES_IN_MS
    ) {
      return {
        ok: false,
        reason:
          "timestamp cannot be more than 5 minutes in the future",
      };
    }
  
    return result;
  }
  
  function parseAttributes(
    value: unknown,
  ): ParseResult<LogAttributes> {
    if (value === undefined) {
      return {
        ok: true,
        value: {},
      };
    }
  
    if (!isRecord(value)) {
      return {
        ok: false,
        reason: "attributes must be a flat object",
      };
    }
  
    for (const [key, attributeValue] of Object.entries(
      value,
    )) {
      const valid =
        typeof attributeValue === "string" ||
        typeof attributeValue === "boolean" ||
        (typeof attributeValue === "number" &&
          Number.isFinite(attributeValue));
  
      if (!valid) {
        return {
          ok: false,
          reason:
            `invalid attribute '${key}': ` +
            "values must be strings, numbers, or booleans",
        };
      }
  
    }
  
    return {
      ok: true,
      value:
        value as LogAttributes,
    };
  }
  
  export function validateLogEntry(
    input: unknown,
    now: Date = new Date(),
  ): ParseResult<ValidatedLogEntry> {
    if (!isRecord(input)) {
      return {
        ok: false,
        reason: "log entry must be an object",
      };
    }
  
    const timestampResult = parseTimestamp(
      input.timestamp,
      now,
    );
  
    if (!timestampResult.ok) {
      return timestampResult;
    }
  
    if (!isLogLevel(input.level)) {
      if (typeof input.level === "string") {
        return {
          ok: false,
          reason: `invalid level: '${input.level}'`,
        };
      }
  
      return {
        ok: false,
        reason:
          "level must be debug, info, warn, or error",
      };
    }
  
    if (
      typeof input.service !== "string" ||
      input.service.trim().length === 0
    ) {
      return {
        ok: false,
        reason: "service must be a non-empty string",
      };
    }
  
    if (
      typeof input.message !== "string" ||
      input.message.trim().length === 0
    ) {
      return {
        ok: false,
        reason: "message must be a non-empty string",
      };
    }
  
    const attributesResult = parseAttributes(
      input.attributes,
    );
  
    if (!attributesResult.ok) {
      return attributesResult;
    }
  
    return {
      ok: true,
      value: {
        timestamp: timestampResult.value.value,
        epochMilliseconds:
          timestampResult.value.epochMilliseconds,
        level: input.level,
        service: input.service,
        message: input.message,
        attributes: attributesResult.value,
      },
    };
  }
  
  export function validateLogBatch(
    entries: readonly unknown[],
    now: Date = new Date(),
  ): ValidatedLogBatch {
    const accepted: ValidatedLogBatch["accepted"] = [];
    const rejected: ValidatedLogBatch["rejected"] = [];
  
    entries.forEach((entry, index) => {
      const result = validateLogEntry(
        entry,
        now,
      );
  
      if (result.ok) {
        accepted.push({
          index,
          log: result.value,
        });
  
        return;
      }
  
      rejected.push({
        index,
        reason: result.reason,
      });
    });
  
    return {
      accepted,
      rejected,
    };
  }
