import type {
    LogAttributes,
  } from "./log.js";
  
  export type NormalizedLogAttributes =
    Record<string, string>;
  
  export function normalizeLogAttributes(
    attributes: LogAttributes,
  ): NormalizedLogAttributes {
    const normalized =
      Object.create(
        null,
      ) as NormalizedLogAttributes;
  
    for (
      const [key, value]
      of Object.entries(attributes)
    ) {
      normalized[key] =
        String(value);
    }
  
    return normalized;
  }
