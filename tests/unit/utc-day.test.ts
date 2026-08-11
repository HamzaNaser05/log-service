import {
    describe,
    expect,
    test,
  } from "vitest";
  
  import {
    addUtcDays,
    logPartitionNameForDay,
    parseManagedLogPartitionName,
    startOfUtcDay,
  } from "../../src/partitioning/utc-day.js";
  
  describe(
    "UTC partition dates",
    () => {
      test(
        "uses the UTC calendar day",
        () => {
          const date =
            new Date(
              "2026-08-11T00:30:00+03:00",
            );
  
          expect(
            startOfUtcDay(
              date,
            ).toISOString(),
          ).toBe(
            "2026-08-10T00:00:00.000Z",
          );
  
          expect(
            logPartitionNameForDay(
              date,
            ),
          ).toBe(
            "logs_2026_08_10",
          );
        },
      );
  
      test(
        "adds UTC days",
        () => {
          const day =
            new Date(
              "2026-08-31T00:00:00Z",
            );
  
          expect(
            addUtcDays(
              day,
              1,
            ).toISOString(),
          ).toBe(
            "2026-09-01T00:00:00.000Z",
          );
        },
      );
  
      test(
        "parses managed partition names",
        () => {
          expect(
            parseManagedLogPartitionName(
              "logs_2026_08_09",
            )?.toISOString(),
          ).toBe(
            "2026-08-09T00:00:00.000Z",
          );
        },
      );
  
      test(
        "rejects invalid partition names",
        () => {
          expect(
            parseManagedLogPartitionName(
              "logs_2026_02_31",
            ),
          ).toBeNull();
  
          expect(
            parseManagedLogPartitionName(
              "users_2026_08_09",
            ),
          ).toBeNull();
        },
      );
    },
  );