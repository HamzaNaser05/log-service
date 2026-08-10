import type {
    LogQueryFilters,
  } from "../domain/log-query.js";
  
  export type SqlParameter =
    | string
    | number;
  
  export type BuiltSqlQuery = {
    text: string;
    values: SqlParameter[];
  };
  
  function addParameter(
    values: SqlParameter[],
    value: SqlParameter,
  ): string {
    values.push(value);
  
    return `$${values.length}`;
  }
  
  function escapeLikeLiteral(
    value: string,
  ): string {
    return value.replace(
      /[!%_]/g,
      (character) => `!${character}`,
    );
  }
  
  export function buildLogSelectQuery(
    filters: LogQueryFilters,
  ): BuiltSqlQuery {
    if (filters.cursor !== null) {
      throw new Error(
        "cursor must be decoded before building the log query",
      );
    }
  
    const values: SqlParameter[] = [];
  
    const conditions: string[] = [];
  
    if (filters.service !== null) {
      const parameter = addParameter(
        values,
        filters.service,
      );
  
      conditions.push(
        `service = ${parameter}`,
      );
    }
  
    if (filters.level !== null) {
      const parameter = addParameter(
        values,
        filters.level,
      );
  
      conditions.push(
        `level = ${parameter}`,
      );
    }
  
    if (filters.since !== null) {
      const parameter = addParameter(
        values,
        filters.since,
      );
  
      conditions.push(
        `timestamp >= ${parameter}::timestamptz`,
      );
    }
  
    if (filters.until !== null) {
      const parameter = addParameter(
        values,
        filters.until,
      );
  
      conditions.push(
        `timestamp < ${parameter}::timestamptz`,
      );
    }
  
    for (
      const attributeFilter
      of filters.attributeFilters
    ) {
      const keyParameter = addParameter(
        values,
        attributeFilter.key,
      );
  
      const valueParameter = addParameter(
        values,
        attributeFilter.value,
      );
  
      conditions.push(
        `attributes ->> ${keyParameter}::text = ${valueParameter}::text`,
      );
    }
  
    if (filters.q !== null) {
      const escapedSearch =
        escapeLikeLiteral(filters.q);
  
      const patternParameter =
        addParameter(
          values,
          `%${escapedSearch}%`,
        );
  
      conditions.push(
        `message ILIKE ${patternParameter} ESCAPE '!'`,
      );
    }
  
    const limitParameter = addParameter(
      values,
      filters.limit,
    );
  
    const lines = [
      "SELECT",
      "  id,",
      "  timestamp,",
      "  level,",
      "  service,",
      "  message,",
      "  attributes",
      "FROM logs",
    ];
  
    if (conditions.length > 0) {
      lines.push(
        "WHERE",
        `  ${conditions.join(
          "\n  AND ",
        )}`,
      );
    }
  
    lines.push(
      "ORDER BY timestamp DESC, id DESC",
      `LIMIT ${limitParameter}`,
    );
  
    return {
      text: lines.join("\n"),
      values,
    };
  }