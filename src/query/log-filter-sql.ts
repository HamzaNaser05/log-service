import type {
    LogFilterSet,
  } from "../domain/log-query.js";
  
  export type SqlParameter =
    | string
    | number;
  
  export function addSqlParameter(
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
  
  export function appendCommonLogFilterConditions(
    filters: LogFilterSet,
    values: SqlParameter[],
    conditions: string[],
  ): void {
    if (filters.service !== null) {
      const parameter =
        addSqlParameter(
          values,
          filters.service,
        );
  
      conditions.push(
        `service = ${parameter}`,
      );
    }
  
    if (filters.level !== null) {
      const parameter =
        addSqlParameter(
          values,
          filters.level,
        );
  
      conditions.push(
        `level = ${parameter}`,
      );
    }
  
    if (filters.since !== null) {
      const parameter =
        addSqlParameter(
          values,
          filters.since,
        );
  
      conditions.push(
        `timestamp >= ${parameter}::timestamptz`,
      );
    }
  
    if (filters.until !== null) {
      const parameter =
        addSqlParameter(
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
      const keyParameter =
        addSqlParameter(
          values,
          attributeFilter.key,
        );
  
      const valueParameter =
        addSqlParameter(
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
        addSqlParameter(
          values,
          `%${escapedSearch}%`,
        );
  
      conditions.push(
        `message ILIKE ${patternParameter} ESCAPE '!'`,
      );
    }
  }