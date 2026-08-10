import {
    describe,
    expect,
    test,
  } from "vitest";
  
  import {
    parseLogAggregateQueryParams,
  } from "../../src/validation/log-aggregate-query.js";
  
  function parse(
    query: string,
  ) {
    return parseLogAggregateQueryParams(
      new URLSearchParams(query),
    );
  }
  
  describe(
    "parseLogAggregateQueryParams",
    () => {
      test(
        "parses a valid aggregation query",
        () => {
          const result = parse(
            [
              "since=2026-08-09T09%3A00%3A00Z",
              "until=2026-08-09T12%3A00%3A00Z",
              "bucket=5m",
              "group_by=service",
              "service=checkout",
              "level=error",
              "attr.region=eu-west",
              "q=payment",
            ].join("&"),
          );
  
          expect(result).toEqual({
            ok: true,
            value: {
              service: "checkout",
              level: "error",
              since:
                "2026-08-09T09:00:00Z",
              until:
                "2026-08-09T12:00:00Z",
              attributeFilters: [
                {
                  key: "region",
                  value: "eu-west",
                },
              ],
              q: "payment",
              bucket: "5m",
              groupBy: "service",
            },
          });
        },
      );
  
      test(
        "requires since",
        () => {
          const result = parse(
            [
              "until=2026-08-09T12%3A00%3A00Z",
              "bucket=1h",
            ].join("&"),
          );
  
          expect(result).toEqual({
            ok: false,
            reason: "since is required",
          });
        },
      );
  
      test(
        "requires until",
        () => {
          const result = parse(
            [
              "since=2026-08-09T09%3A00%3A00Z",
              "bucket=1h",
            ].join("&"),
          );
  
          expect(result).toEqual({
            ok: false,
            reason: "until is required",
          });
        },
      );
  
      test(
        "requires bucket",
        () => {
          const result = parse(
            [
              "since=2026-08-09T09%3A00%3A00Z",
              "until=2026-08-09T12%3A00%3A00Z",
            ].join("&"),
          );
  
          expect(result).toEqual({
            ok: false,
            reason: "bucket is required",
          });
        },
      );
  
      test.each([
        "2m",
        "30m",
        "2h",
        "week",
      ])(
        "rejects invalid bucket %s",
        (bucket) => {
          const result = parse(
            [
              "since=2026-08-09T09%3A00%3A00Z",
              "until=2026-08-09T12%3A00%3A00Z",
              `bucket=${bucket}`,
            ].join("&"),
          );
  
          expect(result.ok).toBe(
            false,
          );
        },
      );
  
      test(
        "rejects invalid group_by",
        () => {
          const result = parse(
            [
              "since=2026-08-09T09%3A00%3A00Z",
              "until=2026-08-09T12%3A00%3A00Z",
              "bucket=1h",
              "group_by=message",
            ].join("&"),
          );
  
          expect(result).toEqual({
            ok: false,
            reason:
              "invalid group_by: 'message'",
          });
        },
      );
  
      test(
        "rejects pagination parameters",
        () => {
          const result = parse(
            [
              "since=2026-08-09T09%3A00%3A00Z",
              "until=2026-08-09T12%3A00%3A00Z",
              "bucket=1h",
              "limit=10",
            ].join("&"),
          );
  
          expect(result).toEqual({
            ok: false,
            reason:
              "unsupported aggregation query parameter: 'limit'",
          });
        },
      );
    },
  );