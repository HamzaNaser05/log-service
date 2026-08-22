import {
    describe,
    expect,
    test,
  } from "vitest";

  import type {
    LogQueryFilters,
  } from "../../src/domain/log-query.js";
  
  import {
    buildLogSelectQuery,
  } from "../../src/query/log-select-query.js";
  
  function createFilters(
    overrides:
      Partial<LogQueryFilters> = {},
  ): LogQueryFilters {
    return {
      service: null,
      level: null,
      since: null,
      until: null,
      attributeFilters: [],
      q: null,
      limit: 100,
      cursor: null,
      ...overrides,
    };
  }
  
  describe(
    "buildLogSelectQuery",
    () => {
      test(
        "builds the default query",
        () => {
          const query =
            buildLogSelectQuery(
              createFilters(),
            );
  
          expect(query.text).toContain(
            "FROM logs",
          );
  
          expect(
            query.text,
          ).not.toContain(
            "WHERE",
          );
  
          expect(query.text).toContain(
            "ORDER BY logs.timestamp DESC, logs.id DESC"
          );
  
          expect(query.text).toContain(
            "LIMIT $1",
          );
  
          // We request limit + 1 so the
          // repository can detect whether
          // another page exists.
          expect(query.values).toEqual([
            101,
          ]);
        },
      );
  
      test(
        "builds freely combined filters",
        () => {
          const query =
            buildLogSelectQuery(
              createFilters({
                service: "checkout",
  
                level: "error",
  
                since:
                  "2026-08-09T00:00:00Z",
  
                until:
                  "2026-08-10T00:00:00Z",
  
                attributeFilters: [
                  {
                    key: "region",
                    value: "eu-west",
                  },
                  {
                    key: "retries",
                    value: "3",
                  },
                ],
  
                q:
                  "payment declined",
  
                limit: 250,
              }),
            );
  
          expect(query.text).toContain(
            "service = $1",
          );
  
          expect(query.text).toContain(
            "level = $2",
          );
  
          expect(query.text).toContain(
            "timestamp >= $3::timestamptz",
          );
  
          expect(query.text).toContain(
            "timestamp < $4::timestamptz",
          );
  
          expect(query.text).toContain(
            "attributes_normalized @> $5::jsonb",
          );
  
          expect(query.text).toContain(
            "attributes_normalized @> $6::jsonb",
          );
  
          expect(query.text).toContain(
            "message ILIKE $7 ESCAPE '!'",
          );
  
          expect(query.text).toContain(
            "LIMIT $8",
          );
  
          expect(query.values).toEqual([
            "checkout",
            "error",
  
            "2026-08-09T00:00:00Z",
            "2026-08-10T00:00:00Z",
  
            '{"region":"eu-west"}',
            '{"retries":"3"}',
  
            "%payment declined%",
  
            251,
          ]);
        },
      );
  
      test(
        "keeps SQL-injection-shaped service values out of SQL text",
        () => {
          const maliciousValue =
            "checkout' OR TRUE --";
  
          const query =
            buildLogSelectQuery(
              createFilters({
                service:
                  maliciousValue,
              }),
            );
  
          expect(query.text).toContain(
            "service = $1",
          );
  
          expect(
            query.text,
          ).not.toContain(
            maliciousValue,
          );
  
          expect(query.values).toEqual([
            maliciousValue,
            101,
          ]);
        },
      );
  
      test(
        "keeps attribute keys and values out of SQL text",
        () => {
          const maliciousKey =
            "region') = 'x' OR TRUE --";
  
          const maliciousValue =
            "eu-west' OR TRUE --";
  
          const query =
            buildLogSelectQuery(
              createFilters({
                attributeFilters: [
                  {
                    key:
                      maliciousKey,
  
                    value:
                      maliciousValue,
                  },
                ],
              }),
            );
  
          expect(query.text).toContain(
            "attributes_normalized @> $1::jsonb",
          );
  
          expect(
            query.text,
          ).not.toContain(
            maliciousKey,
          );
  
          expect(
            query.text,
          ).not.toContain(
            maliciousValue,
          );
  
          const attributeParameter =
            query.values[0];
  
          expect(
            typeof attributeParameter,
          ).toBe("string");
  
          if (
            typeof attributeParameter !==
            "string"
          ) {
            throw new Error(
              "Expected JSON attribute parameter",
            );
          }
  
          expect(
            JSON.parse(
              attributeParameter,
            ),
          ).toEqual({
            [maliciousKey]:
              maliciousValue,
          });
  
          // limit = 100,
          // so SQL fetches 101.
          expect(
            query.values[1],
          ).toBe(101);
        },
      );
  
      test(
        "escapes LIKE wildcard characters while preserving backslashes",
        () => {
          const search =
            String.raw`100%_!\match`;
  
          const query =
            buildLogSelectQuery(
              createFilters({
                q: search,
              }),
            );
  
          expect(query.text).toContain(
            "message ILIKE $1 ESCAPE '!'",
          );
  
          expect(query.values).toEqual([
            String.raw`%100!%!_!!\match%`,
            101,
          ]);
        },
      );
  
      test(
        "refuses an opaque cursor that was not decoded",
        () => {
          expect(() =>
            buildLogSelectQuery(
              createFilters({
                cursor:
                  "opaque-token",
              }),
            ),
          ).toThrow(
            "opaque cursor was not decoded",
          );
        },
      );
  
      test(
        "adds deterministic keyset pagination",
        () => {
          const query =
            buildLogSelectQuery(
              createFilters({
                cursor:
                  "opaque-token",
  
                limit: 20,
              }),
  
              {
                timestamp:
                  "2026-08-09T12:00:00.123456Z",
  
                id: "42",
              },
            );
  
          expect(query.text).toContain(
            "(timestamp, id) < ($1::timestamptz, $2::bigint)",
          );
  
          expect(query.text).toContain(
            "ORDER BY logs.timestamp DESC, logs.id DESC"          
          );
  
          expect(query.text).toContain(
            "LIMIT $3",
          );
  
          expect(query.values).toEqual([
            "2026-08-09T12:00:00.123456Z",
            "42",
  
            // requested limit = 20
            // query fetches 21
            21,
          ]);
        },
      );
    },
  );
