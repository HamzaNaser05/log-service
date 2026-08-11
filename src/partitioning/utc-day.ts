export const MILLISECONDS_PER_DAY =
  86_400_000;

const MANAGED_PARTITION_PATTERN =
  /^logs_(\d{4})_(\d{2})_(\d{2})$/;

export function startOfUtcDay(
  date: Date,
): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
  );
}

export function addUtcDays(
  date: Date,
  days: number,
): Date {
  if (!Number.isInteger(days)) {
    throw new Error(
      "UTC day offset must be an integer",
    );
  }

  return new Date(
    date.getTime() +
      days * MILLISECONDS_PER_DAY,
  );
}

export function logPartitionNameForDay(
  date: Date,
): string {
  const day =
    startOfUtcDay(date);

  const year = String(
    day.getUTCFullYear(),
  );

  const month = String(
    day.getUTCMonth() + 1,
  ).padStart(2, "0");

  const dateOfMonth = String(
    day.getUTCDate(),
  ).padStart(2, "0");

  return (
    `logs_${year}_` +
    `${month}_${dateOfMonth}`
  );
}

export function parseManagedLogPartitionName(
  name: string,
): Date | null {
  const match =
    MANAGED_PARTITION_PATTERN.exec(
      name,
    );

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
    ),
  );

  if (
    parsed.getUTCFullYear() !==
      year ||
    parsed.getUTCMonth() !==
      month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}