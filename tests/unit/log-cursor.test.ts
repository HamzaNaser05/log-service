import {
    describe,
    expect,
    test,
  } from "vitest";
  
  import {
    decodeLogCursor,
    encodeLogCursor,
  } from "../../src/query/log-cursor.js";
  
  function encodePayload(
    payload: unknown,
  ): string {
    return Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");
  }
  
  describe(
    "log cursor",
    () => {
      test(
        "round trips a valid cursor without losing microseconds",
        () => {
          const encoded =
            encodeLogCursor({
              timestamp:
                "2026-08-09T12:00:00.123456Z",
              id: "922337",
            });
  
          expect(
            decodeLogCursor(encoded),
          ).toEqual({
            ok: true,
            value: {
              timestamp:
                "2026-08-09T12:00:00.123456Z",
              id: "922337",
            },
          });
        },
      );
  
      test(
        "rejects invalid base64url characters",
        () => {
          const result =
            decodeLogCursor(
              "not*valid",
            );
  
          expect(result.ok).toBe(
            false,
          );
        },
      );
  
      test(
        "rejects invalid JSON",
        () => {
          const encoded =
            Buffer.from(
              "not-json",
              "utf8",
            ).toString(
              "base64url",
            );
  
          expect(
            decodeLogCursor(encoded)
              .ok,
          ).toBe(false);
        },
      );
  
      test(
        "rejects unsupported versions",
        () => {
          const encoded =
            encodePayload({
              v: 2,
              t:
                "2026-08-09T12:00:00Z",
              i: "1",
            });
  
          expect(
            decodeLogCursor(encoded)
              .ok,
          ).toBe(false);
        },
      );
  
      test(
        "rejects invalid timestamps",
        () => {
          const encoded =
            encodePayload({
              v: 1,
              t:
                "2026-02-31T12:00:00Z",
              i: "1",
            });
  
          expect(
            decodeLogCursor(encoded)
              .ok,
          ).toBe(false);
        },
      );
  
      test(
        "rejects invalid bigint ids",
        () => {
          const encoded =
            encodePayload({
              v: 1,
              t:
                "2026-08-09T12:00:00Z",
              i: "-5",
            });
  
          expect(
            decodeLogCursor(encoded)
              .ok,
          ).toBe(false);
        },
      );
    },
  );