import type {
  ValidatedLogEntry,
} from "../domain/log.js";

import {
  normalizeLogAttributes,
} from "../domain/log-attributes.js";

const TEXT_COPY_ESCAPE_PATTERN =
  /[\\\t\n\r]/g;

const TEXT_COPY_ESCAPES:
  Record<string, string> = {
    "\\": "\\\\",
    "\t": "\\t",
    "\n": "\\n",
    "\r": "\\r",
  };

function escapeTextCopyField(
  value: string,
): string {
  return value.replace(
    TEXT_COPY_ESCAPE_PATTERN,
    (character) =>
      TEXT_COPY_ESCAPES[character] ??
      character,
  );
}

export function encodeLogsForTextCopy(
  logs: readonly ValidatedLogEntry[],
): Buffer {
  const rows:
    string[] = [];

  for (const log of logs) {
    rows.push(
      escapeTextCopyField(log.timestamp),
      "\t",
      escapeTextCopyField(log.level),
      "\t",
      escapeTextCopyField(log.service),
      "\t",
      escapeTextCopyField(log.message),
      "\t",
      escapeTextCopyField(
        JSON.stringify(log.attributes),
      ),
      "\t",
      escapeTextCopyField(
        JSON.stringify(
          normalizeLogAttributes(
            log.attributes,
          ),
        ),
      ),
      "\n",
    );
  }

  return Buffer.from(
    rows.join(""),
    "utf8",
  );
}
