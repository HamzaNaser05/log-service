import type { AggregateBucket } from "../api/types";

export const TIME_RANGES = [
  { value: "15m", label: "Last 15 minutes", milliseconds: 15 * 60 * 1000 },
  { value: "1h", label: "Last hour", milliseconds: 60 * 60 * 1000 },
  { value: "6h", label: "Last 6 hours", milliseconds: 6 * 60 * 60 * 1000 },
  { value: "24h", label: "Last 24 hours", milliseconds: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7 days", milliseconds: 7 * 24 * 60 * 60 * 1000 },
] as const;

export type TimeRangeValue = (typeof TIME_RANGES)[number]["value"];

export function getTimeRange(value: TimeRangeValue, now = new Date()) {
  const selection = TIME_RANGES.find((range) => range.value === value) ?? TIME_RANGES[3];
  return {
    since: new Date(now.getTime() - selection.milliseconds).toISOString(),
    until: now.toISOString(),
    durationSeconds: selection.milliseconds / 1000,
  };
}

export function bucketForRange(value: TimeRangeValue): AggregateBucket {
  if (value === "15m" || value === "1h") return "1m";
  if (value === "6h" || value === "24h") return "1h";
  return "1d";
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatRate(value: number): string {
  if (value === 0) return "0";
  if (value < 0.01) return "<0.01";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatChartTime(value: string, bucket: AggregateBucket): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  if (bucket === "1d") {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function toLocalDateTimeInput(date: Date): string {
  const offsetMilliseconds = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMilliseconds).toISOString().slice(0, 16);
}

export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;

  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}
