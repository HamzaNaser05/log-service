import { useEffect, useMemo, useState } from "react";
import { getAggregate, getLogs } from "../api/client";
import type { AggregatePoint, LogEntry } from "../api/types";
import { Icon } from "../components/Icons";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { EmptyState, ErrorNotice, LevelBadge, LoadingBlock, PageHeader } from "../components/ui";
import {
  TIME_RANGES,
  bucketForRange,
  formatNumber,
  formatRate,
  getTimeRange,
  relativeTime,
  type TimeRangeValue,
} from "../lib/format";

export type HealthState =
  | { status: "loading" }
  | { status: "healthy" }
  | { status: "unavailable"; message: string };

type OverviewData = {
  series: AggregatePoint[];
  total: number;
  errors: number;
  warnings: number;
  recentLogs: LogEntry[];
};

export function Overview({
  apiBaseUrl,
  refreshKey,
  health,
  onRefresh,
}: {
  apiBaseUrl: string;
  refreshKey: number;
  health: HealthState;
  onRefresh: () => void;
}) {
  const [range, setRange] = useState<TimeRangeValue>("24h");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const selectedRange = getTimeRange(range);
    const bucket = bucketForRange(range);

    setLoading(true);
    setError(null);

    Promise.all([
      getAggregate(apiBaseUrl, { ...selectedRange, bucket }, controller.signal),
      getAggregate(apiBaseUrl, { ...selectedRange, bucket, groupBy: "level" }, controller.signal),
      getLogs(apiBaseUrl, { since: selectedRange.since, until: selectedRange.until, limit: 7 }, controller.signal),
    ])
      .then(([totalResponse, levelResponse, logsResponse]) => {
        const total = totalResponse.buckets.reduce((sum, point) => sum + point.count, 0);
        const errors = levelResponse.buckets
          .filter((point) => point.group === "error")
          .reduce((sum, point) => sum + point.count, 0);
        const warnings = levelResponse.buckets
          .filter((point) => point.group === "warn")
          .reduce((sum, point) => sum + point.count, 0);

        setData({
          series: totalResponse.buckets,
          total,
          errors,
          warnings,
          recentLogs: logsResponse.logs,
        });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "An unexpected API error occurred.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiBaseUrl, range, refreshKey]);

  const selectedRange = useMemo(() => getTimeRange(range), [range, refreshKey]);
  const averageRate = data ? data.total / selectedRange.durationSeconds : 0;
  const bucket = bucketForRange(range);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Overview"
        description="A live, API-backed view of log volume and service health."
        actions={
          <select className="select compact-control" value={range} onChange={(event) => setRange(event.target.value as TimeRangeValue)} aria-label="Overview time range">
            {TIME_RANGES.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        }
      />

      {error && <ErrorNotice message={error} onRetry={onRefresh} />}

      <section className="metric-grid" aria-label="Overview metrics">
        <article className="metric-card metric-health">
          <div className="metric-card-top">
            <span className="metric-icon"><Icon name="database" /></span>
            <span className={`status-pill ${health.status === "healthy" ? "status-ok" : health.status === "unavailable" ? "status-error" : "status-loading"}`}>
              <span />{health.status === "healthy" ? "Operational" : health.status === "unavailable" ? "Unavailable" : "Checking"}
            </span>
          </div>
          <div className="metric-value metric-health-value">API + database</div>
          <p>{health.status === "healthy" ? "Health check confirms database connectivity" : health.status === "unavailable" ? health.message : "Contacting /health…"}</p>
        </article>

        <MetricCard icon="logs" label="Logs in range" value={loading ? null : formatNumber(data?.total ?? 0)} detail={TIME_RANGES.find((item) => item.value === range)?.label ?? "Selected range"} />
        <MetricCard icon="alert" tone="error" label="Errors" value={loading ? null : formatNumber(data?.errors ?? 0)} detail="Level = error" />
        <MetricCard icon="warning" tone="warning" label="Warnings" value={loading ? null : formatNumber(data?.warnings ?? 0)} detail="Level = warn" />
        <MetricCard icon="activity" tone="accent" label="Window avg logs/sec" value={loading ? null : formatRate(averageRate)} detail="Aggregate count ÷ selected duration" />
      </section>

      <div className="overview-grid">
        <section className="panel volume-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">Traffic</span><h2>Logs over time</h2></div>
            <span className="subtle-label">{bucket} buckets · database aggregate</span>
          </div>
          {loading && !data ? (
            <LoadingBlock rows={5} />
          ) : data && data.series.length > 0 ? (
            <TimeSeriesChart points={data.series} bucket={bucket} compact />
          ) : (
            <EmptyState icon="analytics" title="No volume in this range" description="The aggregate endpoint returned no log buckets for the selected window." />
          )}
        </section>

        <section className="panel recent-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">Latest events</span><h2>Recent logs</h2></div>
            <a className="text-link" href="#logs">Explore all <Icon name="arrow" /></a>
          </div>
          {loading && !data ? (
            <LoadingBlock rows={6} />
          ) : data && data.recentLogs.length > 0 ? (
            <div className="recent-list">
              {data.recentLogs.map((log) => (
                <article className="recent-log" key={log.id}>
                  <span className={`log-rail rail-${log.level}`} />
                  <div className="recent-log-main">
                    <div className="recent-log-meta"><LevelBadge level={log.level} /><strong>{log.service}</strong><time title={log.timestamp}>{relativeTime(log.timestamp)}</time></div>
                    <p title={log.message}>{log.message}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No recent logs" description="Logs ingested in the selected time range will appear here." />
          )}
        </section>
      </div>
    </>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: "logs" | "alert" | "warning" | "activity";
  label: string;
  value: string | null;
  detail: string;
  tone?: "default" | "error" | "warning" | "accent";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card-top"><span className="metric-icon"><Icon name={icon} /></span><span className="metric-label">{label}</span></div>
      {value === null ? <div className="metric-value-skeleton" /> : <div className="metric-value">{value}</div>}
      <p>{detail}</p>
    </article>
  );
}
