export type AppConfig = {
    port: number;
    databaseUrl: string;
    retentionDays: number;
    partitionAheadDays: number;
  };
  
  function requireEnv(
    name: string,
  ): string {
    const value = process.env[name];
  
    if (
      value === undefined ||
      value.trim() === ""
    ) {
      throw new Error(
        `Missing required environment variable: ${name}`,
      );
    }
  
    return value;
  }
  
  function parsePort(
    value: string,
  ): number {
    const port = Number(value);
  
    if (
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new Error(
        `Invalid PORT: ${value}`,
      );
    }
  
    return port;
  }
  
  function parseIntegerInRange(
    name: string,
    value: string,
    minimum: number,
    maximum: number,
  ): number {
    if (!/^\d+$/.test(value)) {
      throw new Error(
        `${name} must be an integer`,
      );
    }
  
    const parsed = Number(value);
  
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < minimum ||
      parsed > maximum
    ) {
      throw new Error(
        `${name} must be between ${minimum} and ${maximum}`,
      );
    }
  
    return parsed;
  }
  
  export function loadConfig(): AppConfig {
    return {
      port: parsePort(
        requireEnv("PORT"),
      ),
  
      databaseUrl:
        requireEnv(
          "DATABASE_URL",
        ),
  
      retentionDays:
        parseIntegerInRange(
          "RETENTION_DAYS",
          requireEnv(
            "RETENTION_DAYS",
          ),
          1,
          3650,
        ),
  
      partitionAheadDays:
        parseIntegerInRange(
          "PARTITION_AHEAD_DAYS",
          requireEnv(
            "PARTITION_AHEAD_DAYS",
          ),
          1,
          31,
        ),
    };
  }