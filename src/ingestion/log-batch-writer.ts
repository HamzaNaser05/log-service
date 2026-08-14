import type {
    ValidatedLogEntry,
  } from "../domain/log.js";
  
  export interface LogBatchWriter {
    start(): Promise<void>;
  
    write(
      logs:
        readonly ValidatedLogEntry[],
    ): Promise<void>;
  
    close(): Promise<void>;
  }