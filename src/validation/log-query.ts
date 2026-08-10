import type {
    LogLevel,
  } from "../domain/log.js";
  
  import type {
    LogAttributeFilter,
    LogQueryFilters,
  } from "../domain/log-query.js";
  
  import {
    parseIsoTimestamp,
  } from "./iso-timestamp.js";
  
  type LogQueryParseResult =
    | {
        ok: true;
        value: LogQueryFilters;
      }
    | {
        ok: false;
        reason: string;
      };
  
  const DEFAULT_LIMIT = 100;
  
  const MAX_LIMIT = 1000;
  
  const ATTRIBUTE_PREFIX = "attr.";
  
  const SCALAR_PARAMETERS =
    new Set([
      "service",
      "level",
      "since",
      "until",
      "q",
      "limit",
      "cursor",
    ]);
  
  function isLogLevel(
    value: string,
  ): value is LogLevel {
    return (
      value === "debug" ||
      value === "info" ||
      value === "warn" ||
      value === "error"
    );
  }
  
  function parseLimit(
    value: string,
  ): LogQueryParseResult | number {
    if (!/^\d+$/.test(value)) {
      return {
        ok: false,
        reason:
          "limit must be an integer between 1 and 1000",
      };
    }
  
    const parsed = Number(value);
  
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > MAX_LIMIT
    ) {
      return {
        ok: false,
        reason:
          "limit must be an integer between 1 and 1000",
      };
    }
  
    return parsed;
  }
  
  export function parseLogQueryParams(
    params: URLSearchParams,
  ): LogQueryParseResult {
    let service: string | null = null;
  
    let level: LogLevel | null = null;
  
    let since: string | null = null;
    let sinceMilliseconds:
      number | null = null;
  
    let until: string | null = null;
    let untilMilliseconds:
      number | null = null;
  
    let q: string | null = null;
  
    let limit = DEFAULT_LIMIT;
  
    let cursor: string | null = null;
  
    const attributeFilters:
      LogAttributeFilter[] = [];
  
    const seenScalarParameters =
      new Set<string>();
  
    const seenAttributeKeys =
      new Set<string>();
  
    for (const [name, value] of params) {
      if (
        name.startsWith(
          ATTRIBUTE_PREFIX,
        )
      ) {
        const key = name.slice(
          ATTRIBUTE_PREFIX.length,
        );
  
        if (key.trim().length === 0) {
          return {
            ok: false,
            reason:
              "attribute filter key must not be empty",
          };
        }
  
        if (
          seenAttributeKeys.has(key)
        ) {
          return {
            ok: false,
            reason:
              `duplicate attribute filter: '${key}'`,
          };
        }
  
        seenAttributeKeys.add(key);
  
        attributeFilters.push({
          key,
          value,
        });
  
        continue;
      }
  
      if (
        !SCALAR_PARAMETERS.has(name)
      ) {
        return {
          ok: false,
          reason:
            `unsupported query parameter: '${name}'`,
        };
      }
  
      if (
        seenScalarParameters.has(name)
      ) {
        return {
          ok: false,
          reason:
            `duplicate query parameter: '${name}'`,
        };
      }
  
      seenScalarParameters.add(name);
  
      switch (name) {
        case "service": {
          if (
            value.trim().length === 0
          ) {
            return {
              ok: false,
              reason:
                "service must be a non-empty string",
            };
          }
  
          service = value;
          break;
        }
  
        case "level": {
          if (!isLogLevel(value)) {
            return {
              ok: false,
              reason:
                `invalid level: '${value}'`,
            };
          }
  
          level = value;
          break;
        }
  
        case "since": {
          const result =
            parseIsoTimestamp(
              value,
              "since",
            );
  
          if (!result.ok) {
            return result;
          }
  
          since =
            result.value.value;
  
          sinceMilliseconds =
            result.value
              .epochMilliseconds;
  
          break;
        }
  
        case "until": {
          const result =
            parseIsoTimestamp(
              value,
              "until",
            );
  
          if (!result.ok) {
            return result;
          }
  
          until =
            result.value.value;
  
          untilMilliseconds =
            result.value
              .epochMilliseconds;
  
          break;
        }
  
        case "q": {
          if (
            value.trim().length === 0
          ) {
            return {
              ok: false,
              reason:
                "q must be a non-empty string",
            };
          }
  
          q = value;
          break;
        }
  
        case "limit": {
          const result =
            parseLimit(value);
  
          if (
            typeof result !== "number"
          ) {
            return result;
          }
  
          limit = result;
          break;
        }
  
        case "cursor": {
          if (
            value.trim().length === 0
          ) {
            return {
              ok: false,
              reason:
                "cursor must be a non-empty string",
            };
          }
  
          cursor = value;
          break;
        }
      }
    }
  
    if (
      sinceMilliseconds !== null &&
      untilMilliseconds !== null &&
      sinceMilliseconds >
        untilMilliseconds
    ) {
      return {
        ok: false,
        reason:
          "since must not be after until",
      };
    }
  
    return {
      ok: true,
      value: {
        service,
        level,
        since,
        until,
        attributeFilters,
        q,
        limit,
        cursor,
      },
    };
  }