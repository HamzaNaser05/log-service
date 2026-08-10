import type {
    LogAttributes,
  } from "./log.js";
  
  export type NormalizedLogAttributes =
    Record<string, string>;
  
  export function normalizeLogAttributes(
    attributes: LogAttributes,
  ): NormalizedLogAttributes {
    const normalized:
      NormalizedLogAttributes = {};
  
    for (
      const [key, value]
      of Object.entries(attributes)
    ) {
      Object.defineProperty(
        normalized,
        key,
        {
          value: String(value),
          enumerable: true,
          writable: true,
          configurable: true,
        },
      );
    }
  
    return normalized;
  }