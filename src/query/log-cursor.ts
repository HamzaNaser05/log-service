import {
    parseIsoTimestamp,
  } from "../validation/iso-timestamp.js";
  
  export type LogCursor = {
    timestamp: string;
    id: string;
  };
  
  type CursorDecodeResult =
    | {
        ok: true;
        value: LogCursor;
      }
    | {
        ok: false;
        reason: string;
      };
  
  type CursorPayload = {
    v: number;
    t: string;
    i: string;
  };
  
  const CURSOR_VERSION = 1;
  
  const MAX_CURSOR_LENGTH = 512;
  
  const POSTGRES_BIGINT_MAX =
    9_223_372_036_854_775_807n;
  
  const BASE64URL_PATTERN =
    /^[A-Za-z0-9_-]+$/;
  
  function isRecord(
    value: unknown,
  ): value is Record<string, unknown> {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }
  
  function hasExactCursorFields(
    value: Record<string, unknown>,
  ): boolean {
    const keys = Object.keys(value).sort();
  
    return (
      keys.length === 3 &&
      keys[0] === "i" &&
      keys[1] === "t" &&
      keys[2] === "v"
    );
  }
  
  export function encodeLogCursor(
    cursor: LogCursor,
  ): string {
    const payload: CursorPayload = {
      v: CURSOR_VERSION,
      t: cursor.timestamp,
      i: cursor.id,
    };
  
    return Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");
  }
  
  export function decodeLogCursor(
    encodedCursor: string,
  ): CursorDecodeResult {
    if (
      encodedCursor.length === 0 ||
      encodedCursor.length >
        MAX_CURSOR_LENGTH
    ) {
      return {
        ok: false,
        reason: "invalid cursor length",
      };
    }
  
    if (
      !BASE64URL_PATTERN.test(
        encodedCursor,
      )
    ) {
      return {
        ok: false,
        reason:
          "cursor must be valid base64url",
      };
    }
  
    let json: string;
  
    try {
      json = Buffer.from(
        encodedCursor,
        "base64url",
      ).toString("utf8");
    } catch {
      return {
        ok: false,
        reason:
          "cursor could not be decoded",
      };
    }
  
    const canonicalEncoding =
      Buffer.from(
        json,
        "utf8",
      ).toString("base64url");
  
    if (
      canonicalEncoding !== encodedCursor
    ) {
      return {
        ok: false,
        reason:
          "cursor encoding is invalid",
      };
    }
  
    let payload: unknown;
  
    try {
      payload = JSON.parse(json);
    } catch {
      return {
        ok: false,
        reason:
          "cursor payload is invalid",
      };
    }
  
    if (!isRecord(payload)) {
      return {
        ok: false,
        reason:
          "cursor payload must be an object",
      };
    }
  
    if (!hasExactCursorFields(payload)) {
      return {
        ok: false,
        reason:
          "cursor payload has invalid fields",
      };
    }
  
    if (payload.v !== CURSOR_VERSION) {
      return {
        ok: false,
        reason:
          "unsupported cursor version",
      };
    }
  
    if (
      typeof payload.t !== "string"
    ) {
      return {
        ok: false,
        reason:
          "cursor timestamp is invalid",
      };
    }
  
    if (
      typeof payload.i !== "string"
    ) {
      return {
        ok: false,
        reason:
          "cursor id is invalid",
      };
    }
  
    const timestampResult =
      parseIsoTimestamp(
        payload.t,
        "cursor timestamp",
      );
  
    if (!timestampResult.ok) {
      return {
        ok: false,
        reason:
          timestampResult.reason,
      };
    }
  
    if (!/^[1-9]\d*$/.test(payload.i)) {
      return {
        ok: false,
        reason:
          "cursor id must be a positive bigint",
      };
    }
  
    let id: bigint;
  
    try {
      id = BigInt(payload.i);
    } catch {
      return {
        ok: false,
        reason:
          "cursor id must be a positive bigint",
      };
    }
  
    if (id > POSTGRES_BIGINT_MAX) {
      return {
        ok: false,
        reason:
          "cursor id exceeds PostgreSQL bigint range",
      };
    }
  
    return {
      ok: true,
      value: {
        timestamp:
          timestampResult.value.value,
        id: payload.i,
      },
    };
  }