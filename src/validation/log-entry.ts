import type {
    LogAttributes,
    LogLevel,
    ValidatedLogBatch,
    ValidatedLogEntry,
  } from "../domain/log.js";
  
  type ParseResult<T> =
    | {
        ok: true;
        value: T;
      }
    | {
        ok: false;
        reason: string;
      };
  
  type ParsedTimestamp = {
    value: string;
    epochMilliseconds: number;
  };
  
  const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
  
  const ISO_TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
  
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
  
  function isLeapYear(year: number): boolean {
    return (
      year % 400 === 0 ||
      (year % 4 === 0 && year % 100 !== 0)
    );
  }
  
  function daysInMonth(
    year: number,
    month: number,
  ): number {
    switch (month) {
      case 2:
        return isLeapYear(year) ? 29 : 28;
  
      case 4:
      case 6:
      case 9:
      case 11:
        return 30;
  
      default:
        return 31;
    }
  }
  
  function parseTimestamp(
    value: unknown,
    now: Date,
  ): ParseResult<ParsedTimestamp> {
    if (typeof value !== "string") {
      return {
        ok: false,
        reason: "timestamp is required and must be a string",
      };
    }
  
    if (!ISO_TIMESTAMP_PATTERN.test(value)) {
      return {
        ok: false,
        reason:
          "timestamp must be a valid ISO 8601 date-time with timezone",
      };
    }
  
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const hour = Number(value.slice(11, 13));
    const minute = Number(value.slice(14, 16));
    const second = Number(value.slice(17, 19));
  
    if (month < 1 || month > 12) {
      return {
        ok: false,
        reason: "timestamp contains an invalid month",
      };
    }
  
    const maximumDay = daysInMonth(year, month);
  
    if (day < 1 || day > maximumDay) {
      return {
        ok: false,
        reason: "timestamp contains an invalid day",
      };
    }
  
    if (hour < 0 || hour > 23) {
      return {
        ok: false,
        reason: "timestamp contains an invalid hour",
      };
    }
  
    if (minute < 0 || minute > 59) {
      return {
        ok: false,
        reason: "timestamp contains an invalid minute",
      };
    }
  
    if (second < 0 || second > 59) {
      return {
        ok: false,
        reason: "timestamp contains an invalid second",
      };
    }
  
    const timezoneStart =
      value.endsWith("Z")
        ? value.length - 1
        : Math.max(
            value.lastIndexOf("+"),
            value.lastIndexOf("-"),
          );
  
    const fractionalStart = value.indexOf(".", 19);
  
    const fractionalPart =
      fractionalStart === -1
        ? ""
        : value.slice(
            fractionalStart + 1,
            timezoneStart,
          );
  
    const milliseconds = Number(
      `${fractionalPart}000`.slice(0, 3),
    );
  
    const timezone = value.slice(timezoneStart);
  
    let offsetMinutes = 0;
  
    if (timezone !== "Z") {
      const offsetHour = Number(
        timezone.slice(1, 3),
      );
  
      const offsetMinute = Number(
        timezone.slice(4, 6),
      );
  
      if (
        offsetHour > 23 ||
        offsetMinute > 59
      ) {
        return {
          ok: false,
          reason:
            "timestamp contains an invalid timezone offset",
        };
      }
  
      const direction =
        timezone.startsWith("+") ? 1 : -1;
  
      offsetMinutes =
        direction *
        (offsetHour * 60 + offsetMinute);
    }
  
    const localTime = new Date(0);
  
    localTime.setUTCFullYear(
      year,
      month - 1,
      day,
    );
  
    localTime.setUTCHours(
      hour,
      minute,
      second,
      milliseconds,
    );
  
    const epochMilliseconds =
      localTime.getTime() -
      offsetMinutes * 60 * 1000;
  
    if (
      epochMilliseconds >
      now.getTime() + FIVE_MINUTES_IN_MS
    ) {
      return {
        ok: false,
        reason:
          "timestamp cannot be more than 5 minutes in the future",
      };
    }
  
    return {
      ok: true,
      value: {
        value,
        epochMilliseconds,
      },
    };
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
  
    const attributes: LogAttributes = {};
  
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
  
      Object.defineProperty(
        attributes,
        key,
        {
          value: attributeValue,
          enumerable: true,
          writable: true,
          configurable: true,
        },
      );
    }
  
    return {
      ok: true,
      value: attributes,
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