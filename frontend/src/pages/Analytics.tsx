import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getAggregate } from "../api/client";
import type { AggregateBucket, AggregateGroupBy, AggregatePoint, LogLevel } from "../api/types";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { EmptyState, ErrorNotice, PageHeader, Spinner } from "../components/ui";
import { formatNumber, formatTimestamp, localInputToIso, toLocalDateTimeInput } from "../lib/format";

type AnalyticsForm = {
  since: string;
  until: string;
  bucket: AggregateBucket;
  groupBy: "none" | AggregateGroupBy;
  service: string;
  level: "" | LogLevel;
};

function defaultForm(): AnalyticsForm {
  const now = new Date();
  return {
    since: toLocalDateTimeInput(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    until: toLocalDateTimeInput(now),
    bucket: "1h",
    groupBy: "service",
    service: "",
    level: "",
  };
}

export function Analytics({
  apiBaseUrl,
  refreshKey,
  onRefresh,
}: {
  apiBaseUrl: string;
  refreshKey: number;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState<AnalyticsForm>(defaultForm);
  const [applied, setApplied] = useState<AnalyticsForm>(defaultForm);
  const [points, setPoints] = useState<AggregatePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const since = localInputToIso(applied.since);
    const until = localInputToIso(applied.until);

    if (!since || !until) return () => controller.abort();

    setLoading(true);
    setError(null);
    getAggregate(
      apiBaseUrl,
      {
        since,
        until,
        bucket: applied.bucket,
        groupBy: applied.groupBy === "none" ? undefined : applied.groupBy,
        service: applied.service.trim() || undefined,
        level: applied.level || undefined,
      },
      controller.signal,
    )
      .then((response) => setPoints(response.buckets))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "An unexpected API error occurred.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiBaseUrl, applied, refreshKey]);

  const groups = useMemo(() => Array.from(new Set(points.map((point) => point.group).filter((group): group is string => group !== null))), [points]);
  const total = useMemo(() => points.reduce((sum, point) => sum + point.count, 0), [points]);

  function runAnalysis(event: FormEvent) {
    event.preventDefault();
    const since = localInputToIso(form.since);
    const until = localInputToIso(form.until);
    if (!since || !until) {
      setValidationError("Both since and until are required by the aggregate endpoint.");
      return;
    }
    if (new Date(since) > new Date(until)) {
      setValidationError("The start time must be before the end time.");
      return;
    }
    setValidationError(null);
    setApplied({ ...form });
  }

  return (
    <>
      <PageHeader
        eyebrow="Database analytics"
        title="Analytics"
        description="Explore time-bucketed volume using PostgreSQL aggregation—not browser-side raw-log processing."
      />

      <section className="panel analytics-controls">
        <form onSubmit={runAnalysis}>
          <div className="analytics-control-row">
            <div className="control-group">
              <span className="control-label">Group by</span>
              <div className="segmented-control">
                {(["none", "service", "level"] as const).map((value) => (
                  <button className={form.groupBy === value ? "active" : ""} key={value} type="button" onClick={() => setForm({ ...form, groupBy: value })}>{value === "none" ? "Total" : value[0].toUpperCase() + value.slice(1)}</button>
                ))}
              </div>
            </div>
            <div className="control-group bucket-control">
              <span className="control-label">Bucket</span>
              <div className="segmented-control">
                {(["1m", "5m", "1h", "1d"] as const).map((value) => <button className={form.bucket === value ? "active" : ""} key={value} type="button" onClick={() => setForm({ ...form, bucket: value })}>{value}</button>)}
              </div>
            </div>
          </div>
          <div className="analytics-filter-grid">
            <label className="field"><span>Since</span><input type="datetime-local" value={form.since} required onChange={(event) => setForm({ ...form, since: event.target.value })} /></label>
            <label className="field"><span>Until <em>exclusive</em></span><input type="datetime-local" value={form.until} required onChange={(event) => setForm({ ...form, until: event.target.value })} /></label>
            <label className="field"><span>Service filter</span><input value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value })} placeholder="All services" /></label>
            <label className="field"><span>Level filter</span><select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as AnalyticsForm["level"] })}><option value="">All levels</option><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option></select></label>
            <button className="button button-primary analytics-run" type="submit">Run analysis</button>
          </div>
          {validationError && <p className="inline-validation" role="alert">{validationError}</p>}
        </form>
      </section>

      {error && <ErrorNotice message={error} onRetry={onRefresh} />}

      <section className="panel analytics-chart-panel">
        <div className="panel-heading analytics-heading">
          <div><span className="section-kicker">Time series</span><h2>Logs over time</h2></div>
          <div className="analytics-summary">
            {loading && <Spinner />}
            <span><strong>{formatNumber(total)}</strong> logs represented</span>
            <span><strong>{points.length}</strong> returned buckets</span>
            <span><strong>{groups.length || 1}</strong> {groups.length === 1 ? "series" : "series"}</span>
          </div>
        </div>

        {loading && points.length === 0 ? (
          <div className="chart-loading"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>
        ) : points.length > 0 ? (
          <TimeSeriesChart points={points} bucket={applied.bucket} />
        ) : !error ? (
          <EmptyState icon="analytics" title="No aggregate data" description="The backend returned no buckets for this time range and filter set." />
        ) : (
          <EmptyState icon="alert" title="Chart unavailable" description="Reconnect to the API or retry the request to load aggregate buckets." />
        )}

        <div className="data-provenance"><span>Source</span><code>GET /logs/aggregate</code><span>•</span><span>{applied.bucket} buckets</span><span>•</span><span>{applied.groupBy === "none" ? "no grouping" : `group_by=${applied.groupBy}`}</span></div>
      </section>

      {points.length > 0 && (
        <section className="panel aggregate-table-panel">
          <div className="panel-heading"><div><span className="section-kicker">Response detail</span><h2>Aggregate buckets</h2></div><span className="subtle-label">Exact values returned by the API</span></div>
          <div className="table-scroll">
            <table className="aggregate-table"><thead><tr><th>Bucket start (local display)</th><th>Group</th><th>Count</th></tr></thead><tbody>{points.map((point, index) => <tr key={`${point.start}-${point.group}-${index}`}><td><time title={point.start}>{formatTimestamp(point.start)}</time></td><td>{point.group ?? <span className="muted">Not grouped</span>}</td><td className="numeric-cell">{formatNumber(point.count)}</td></tr>)}</tbody></table>
          </div>
        </section>
      )}
    </>
  );
}
