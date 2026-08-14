import type {
    ValidatedLogEntry,
  } from "../domain/log.js";
  
  import {
    normalizeLogAttributes,
  } from "../domain/log-attributes.js";
  
  import {
    parseIsoTimestamp,
  } from "../validation/iso-timestamp.js";
  
  const COPY_FIELD_COUNT = 6;
  
  const POSTGRES_EPOCH_UNIX_MICROSECONDS =
    946_684_800_000_000n;
  
  const COPY_SIGNATURE =
    Buffer.from([
      0x50,
      0x47,
      0x43,
      0x4f,
      0x50,
      0x59,
      0x0a,
      0xff,
      0x0d,
      0x0a,
      0x00,
    ]);
  
  function int16(
    value: number,
  ): Buffer {
    const buffer =
      Buffer.allocUnsafe(2);
  
    buffer.writeInt16BE(
      value,
      0,
    );
  
    return buffer;
  }
  
  function int32(
    value: number,
  ): Buffer {
    const buffer =
      Buffer.allocUnsafe(4);
  
    buffer.writeInt32BE(
      value,
      0,
    );
  
    return buffer;
  }
  
  function int64(
    value: bigint,
  ): Buffer {
    const buffer =
      Buffer.allocUnsafe(8);
  
    buffer.writeBigInt64BE(
      value,
      0,
    );
  
    return buffer;
  }
  
  function encodeText(
    value: string,
  ): Buffer {
    return Buffer.from(
      value,
      "utf8",
    );
  }
  
  function encodeJsonb(
    value: unknown,
  ): Buffer {
    const json =
      JSON.stringify(value);
  
    if (json === undefined) {
      throw new Error(
        "Unable to encode JSONB value",
      );
    }
  
    /*
     * PostgreSQL jsonb binary send
     * format:
     *
     * byte 0: version = 1
     * rest: JSON text
     */
    return Buffer.concat([
      Buffer.from([1]),
  
      Buffer.from(
        json,
        "utf8",
      ),
    ]);
  }
  
  function fractionalMicrosecondsBeyondMilliseconds(
    timestamp: string,
  ): bigint {
    const match =
      /\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/
        .exec(timestamp);
  
    if (match === null) {
      return 0n;
    }
  
    const digits =
      match[1];
  
    if (digits === undefined) {
      return 0n;
    }
  
    const microseconds =
      digits.padEnd(
        6,
        "0",
      );
  
    return BigInt(
      microseconds.slice(
        3,
        6,
      ),
    );
  }
  
  function encodeTimestamp(
    timestamp: string,
  ): Buffer {
    const parsed =
      parseIsoTimestamp(
        timestamp,
        "timestamp",
      );
  
    if (!parsed.ok) {
      throw new Error(
        `Cannot binary-encode timestamp: ${parsed.reason}`,
      );
    }
  
    const unixMicroseconds =
      BigInt(
        parsed.value
          .epochMilliseconds,
      ) *
        1000n +
      fractionalMicrosecondsBeyondMilliseconds(
        timestamp,
      );
  
    const postgresMicroseconds =
      unixMicroseconds -
      POSTGRES_EPOCH_UNIX_MICROSECONDS;
  
    return int64(
      postgresMicroseconds,
    );
  }
  
  function encodeField(
    value: Buffer,
  ): Buffer {
    return Buffer.concat([
      int32(
        value.length,
      ),
  
      value,
    ]);
  }
  
  function encodeTuple(
    log: ValidatedLogEntry,
  ): Buffer {
    const normalizedAttributes =
      normalizeLogAttributes(
        log.attributes,
      );
  
    const fields = [
      encodeTimestamp(
        log.timestamp,
      ),
  
      encodeText(
        log.level,
      ),
  
      encodeText(
        log.service,
      ),
  
      encodeText(
        log.message,
      ),
  
      encodeJsonb(
        log.attributes,
      ),
  
      encodeJsonb(
        normalizedAttributes,
      ),
    ];
  
    return Buffer.concat([
      int16(
        COPY_FIELD_COUNT,
      ),
  
      ...fields.map(
        encodeField,
      ),
    ]);
  }
  
  function binaryCopyHeader():
    Buffer {
    /*
     * Header:
     *
     * signature
     * int32 flags
     * int32 extension length
     */
    return Buffer.concat([
      COPY_SIGNATURE,
      int32(0),
      int32(0),
    ]);
  }
  
  function binaryCopyTrailer():
    Buffer {
    return int16(-1);
  }
  
  export function encodeLogsForBinaryCopy(
    logs:
      readonly ValidatedLogEntry[],
  ): Buffer {
    return Buffer.concat([
      binaryCopyHeader(),
  
      ...logs.map(
        encodeTuple,
      ),
  
      binaryCopyTrailer(),
    ]);
  }