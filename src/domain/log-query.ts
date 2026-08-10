import type {
    LogLevel,
  } from "./log.js";
  
  export type LogAttributeFilter = {
    key: string;
    value: string;
  };
  
  export type LogFilterSet = {
    service: string | null;
  
    level: LogLevel | null;
  
    since: string | null;
  
    until: string | null;
  
    attributeFilters:
      readonly LogAttributeFilter[];
  
    q: string | null;
  };
  
  export type LogQueryFilters =
    LogFilterSet & {
      limit: number;
      cursor: string | null;
    };