import {
    describe,
    expect,
    test,
  } from "vitest";
  
  import {
    parseLogQueryParams,
  } from "../../src/validation/log-query.js";
  
  function parse(
    query: string,
  ) {
    return parseLogQueryParams(
      new URLSearchParams(query),
    );
  }
  
  describe(
    "parseLogQueryParams",
    () => {
      test(
        "uses safe defaults",
        () => {
          const result = parse("");
  
          expect(result).toEqual({
            ok: true,
            value: {
              service: null,
              level: null,
              since: null,
              until: null,
              attributeFilters: [],
              q: null,
              limit: 100,
              cursor: null,
            },
          });
        },
      );
  
      test(
        "parses all supported filters",
        () => {
          const result = parse(
            [
              "service=checkout",
              "level=error",
              "since=2026-08-09T00%3A00%3A00Z",
              "until=2026-08-10T00%3A00%3A00Z",
              "attr.region=eu-west",
              "attr.retries=3",
              "q=payment%20declined",
              "limit=250",
              "cursor=opaque-token",
            ].join("&"),
          );
  
          expect(result).toEqual({
            ok: true,
            value: {
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
              q: "payment declined",
              limit: 250,
              cursor: "opaque-token",
            },
          });
        },
      );
  
      test(
        "rejects invalid levels",
        () => {
          expect(
            parse("level=critical"),
          ).toEqual({
            ok: false,
            reason:
              "invalid level: 'critical'",
          });
        },
      );
  
      test.each([
        "0",
        "1001",
        "2.5",
        "abc",
      ])(
        "rejects invalid limit %s",
        (limit) => {
          const result = parse(
            `limit=${limit}`,
          );
  
          expect(result.ok).toBe(false);
        },
      );
  
      test(
        "rejects impossible timestamps",
        () => {
          const result = parse(
            "since=2026-02-31T12%3A00%3A00Z",
          );
  
          expect(result).toEqual({
            ok: false,
            reason:
              "since contains an invalid day",
          });
        },
      );
  
      test(
        "rejects since after until",
        () => {
          const result = parse(
            [
              "since=2026-08-10T00%3A00%3A00Z",
              "until=2026-08-09T00%3A00%3A00Z",
            ].join("&"),
          );
  
          expect(result).toEqual({
            ok: false,
            reason:
              "since must not be after until",
          });
        },
      );
  
      test(
        "rejects duplicate scalar parameters",
        () => {
          const result = parse(
            "service=checkout&service=auth",
          );
  
          expect(result).toEqual({
            ok: false,
            reason:
              "duplicate query parameter: 'service'",
          });
        },
      );
  
      test(
        "rejects duplicate attribute filters",
        () => {
          const result = parse(
            "attr.region=eu&attr.region=us",
          );
  
          expect(result).toEqual({
            ok: false,
            reason:
              "duplicate attribute filter: 'region'",
          });
        },
      );
  
      test(
        "rejects unknown parameters",
        () => {
          const result = parse(
            "sort=random",
          );
  
          expect(result).toEqual({
            ok: false,
            reason:
              "unsupported query parameter: 'sort'",
          });
        },
      );
  
      test(
        "preserves message-search special characters",
        () => {
          const params =
            new URLSearchParams();
  
          params.set(
            "q",
            String.raw`100%_\match`,
          );
  
          const result =
            parseLogQueryParams(params);
  
          expect(result).toEqual({
            ok: true,
            value: {
              service: null,
              level: null,
              since: null,
              until: null,
              attributeFilters: [],
              q: String.raw`100%_\match`,
              limit: 100,
              cursor: null,
            },
          });
        },
      );
  
      test(
        "accepts multiple distinct attribute filters",
        () => {
          const result = parse(
            [
              "attr.region=eu-west",
              "attr.user_id=42",
              "attr.active=true",
            ].join("&"),
          );
  
          expect(result.ok).toBe(true);
  
          if (!result.ok) {
            return;
          }
  
          expect(
            result.value
              .attributeFilters,
          ).toHaveLength(3);
        },
      );
    },
  );