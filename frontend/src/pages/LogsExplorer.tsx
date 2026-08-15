import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getLogs } from "../api/client";
import type { AttributeFilter, LogEntry, LogLevel, LogsQuery } from "../api/types";
import { Icon } from "../components/Icons";
import { EmptyState, ErrorNotice, LevelBadge, PageHeader, Spinner } from "../components/ui";
import { formatTimestamp, localInputToIso, toLocalDateTimeInput } from "../lib/format";

type FilterForm = {
  service: string;
  level: "" | LogLevel;
  since: string;
  until: string;
  query: string;
  attributes: AttributeFilter[];
};

function initialFilters(): FilterForm {
  const now = new Date();
  return {
    service: "",
    level: "",
    since: toLocalDateTimeInput(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    until: toLocalDateTimeInput(now),
    query: "",
    attributes: [],
  };
}

function toQuery(filters: FilterForm): LogsQuery {
  return {
    service: filters.service.trim() || undefined,
    level: filters.level || undefined,
    since: localInputToIso(filters.since),
    until: localInputToIso(filters.until),
    query: filters.query.trim() || undefined,
    attributes: filters.attributes.filter((attribute) => attribute.key.trim()),
    limit: 50,
  };
}

export function LogsExplorer({
  apiBaseUrl,
  refreshKey,
  onRefresh,
}: {
  apiBaseUrl: string;
  refreshKey: number;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState<FilterForm>(initialFilters);
  const [applied, setApplied] = useState<LogsQuery>(() => toQuery(initialFilters()));
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getLogs(
      apiBaseUrl,
      { ...applied, cursor: pageCursors[pageIndex] },
      controller.signal,
    )
      .then((response) => {
        setLogs(response.logs);
        setNextCursor(response.next_cursor);
        setExpanded(new Set());
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "An unexpected API error occurred.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiBaseUrl, applied, pageCursors, pageIndex, refreshKey]);

  const activeFilterCount = useMemo(() => {
    return [applied.service, applied.level, applied.since, applied.until, applied.query]
      .filter(Boolean).length + (applied.attributes?.length ?? 0);
  }, [applied]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const since = localInputToIso(form.since);
    const until = localInputToIso(form.until);

    if (since && until && new Date(since) > new Date(until)) {
      setValidationError("The start time must be before the end time.");
      return;
    }

    const keys = form.attributes.map((attribute) => attribute.key.trim()).filter(Boolean);
    if (new Set(keys).size !== keys.length) {
      setValidationError("Each attribute key can only be used once.");
      return;
    }

    setValidationError(null);
    setApplied(toQuery(form));
    setPageCursors([undefined]);
    setPageIndex(0);
  }

  function clearFilters() {
    const cleared: FilterForm = {
      service: "",
      level: "",
      since: "",
      until: "",
      query: "",
      attributes: [],
    };
    setForm(cleared);
    setApplied(toQuery(cleared));
    setPageCursors([undefined]);
    setPageIndex(0);
    setValidationError(null);
  }

  function nextPage() {
    if (!nextCursor) return;
    setPageCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((current) => current + 1);
  }

  function previousPage() {
    setPageIndex((current) => Math.max(0, current - 1));
  }

  function addAttributeFilter() {
    setForm((current) => ({ ...current, attributes: [...current.attributes, { key: "", value: "" }] }));
  }

  function updateAttribute(index: number, field: keyof AttributeFilter, value: string) {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.map((attribute, attributeIndex) =>
        attributeIndex === index ? { ...attribute, [field]: value } : attribute,
      ),
    }));
  }

  function removeAttribute(index: number) {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.filter((_, attributeIndex) => attributeIndex !== index),
    }));
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Query workspace"
        title="Logs explorer"
        description="Search structured events with the backend’s indexed filters and opaque cursor pagination."
      />

      <section className="panel filter-panel">
        <form onSubmit={applyFilters}>
          <div className="filter-heading">
            <div><span className="section-kicker">Query filters</span><h2>Refine results</h2></div>
            <span className="filter-count">{activeFilterCount} active</span>
          </div>

          <div className="filter-grid">
            <label className="field"><span>Service</span><input value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value })} placeholder="e.g. checkout" /></label>
            <label className="field"><span>Level</span><select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as FilterForm["level"] })}><option value="">All levels</option><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option></select></label>
            <label className="field field-wide"><span>Message contains</span><span className="input-with-icon"><Icon name="search" /><input value={form.query} onChange={(event) => setForm({ ...form, query: event.target.value })} placeholder="Literal, case-insensitive search" /></span></label>
            <label className="field"><span>Since</span><input type="datetime-local" value={form.since} onChange={(event) => setForm({ ...form, since: event.target.value })} /></label>
            <label className="field"><span>Until <em>exclusive</em></span><input type="datetime-local" value={form.until} onChange={(event) => setForm({ ...form, until: event.target.value })} /></label>
          </div>

          <div className="attribute-filter-section">
            <div className="attribute-filter-title"><div><strong>Attribute equality</strong><span>Maps directly to <code>attr.key=value</code></span></div><button className="button button-ghost button-small" type="button" onClick={addAttributeFilter}><Icon name="plus" />Add attribute</button></div>
            {form.attributes.map((attribute, index) => (
              <div className="attribute-filter-row" key={index}>
                <input aria-label={`Attribute ${index + 1} key`} value={attribute.key} onChange={(event) => updateAttribute(index, "key", event.target.value)} placeholder="key (e.g. region)" />
                <span>=</span>
                <input aria-label={`Attribute ${index + 1} value`} value={attribute.value} onChange={(event) => updateAttribute(index, "value", event.target.value)} placeholder="value (e.g. eu-west)" />
                <button className="icon-button" type="button" onClick={() => removeAttribute(index)} aria-label={`Remove attribute filter ${index + 1}`}><Icon name="close" /></button>
              </div>
            ))}
          </div>

          {validationError && <p className="inline-validation" role="alert">{validationError}</p>}
          <div className="filter-actions"><button className="button button-primary" type="submit"><Icon name="search" />Run query</button><button className="button button-secondary" type="button" onClick={clearFilters}>Clear all</button></div>
        </form>
      </section>

      {error && <ErrorNotice message={error} onRetry={onRefresh} />}

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div><span className="section-kicker">Results</span><h2>Structured events</h2></div>
          <div className="result-meta">{loading && <Spinner />}<span>Page {pageIndex + 1}</span><span>Up to 50 rows</span></div>
        </div>

        {loading && logs.length === 0 ? (
          <TableSkeleton />
        ) : logs.length === 0 && !error ? (
          <EmptyState title="No matching logs" description="The API returned no events for these filters. Broaden the time range or remove a filter." />
        ) : (
          <div className={`table-scroll ${loading ? "is-refreshing" : ""}`}>
            <table className="logs-table">
              <thead><tr><th>Timestamp</th><th>Level</th><th>Service</th><th>Message</th><th>Attributes</th></tr></thead>
              <tbody>
                {logs.map((log) => {
                  const hasAttributes = Object.keys(log.attributes).length > 0;
                  const isExpanded = expanded.has(log.id);
                  return (
                    <tr key={log.id}>
                      <td className="timestamp-cell"><time title={log.timestamp}>{formatTimestamp(log.timestamp)}</time><small>#{log.id}</small></td>
                      <td><LevelBadge level={log.level} /></td>
                      <td><span className="service-chip">{log.service}</span></td>
                      <td className="message-cell" title={log.message}>{log.message}</td>
                      <td className="attributes-cell">
                        {hasAttributes ? (
                          <button className="json-toggle" onClick={() => toggleExpanded(log.id)} aria-expanded={isExpanded}>
                            <Icon name="chevron" className={isExpanded ? "expanded" : ""} />{Object.keys(log.attributes).length} {Object.keys(log.attributes).length === 1 ? "field" : "fields"}
                          </button>
                        ) : <span className="empty-json">{'{}'}</span>}
                        {isExpanded && <pre>{JSON.stringify(log.attributes, null, 2)}</pre>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {logs.length > 0 && (
          <div className="pagination">
            <span>Using deterministic cursor pagination</span>
            <div><button className="button button-secondary" onClick={previousPage} disabled={pageIndex === 0 || loading}>Previous</button><button className="button button-primary" onClick={nextPage} disabled={!nextCursor || loading}>Next page<Icon name="chevron" /></button></div>
          </div>
        )}
      </section>
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="table-skeleton" aria-label="Loading logs" aria-busy="true">
      {Array.from({ length: 7 }, (_, index) => <div key={index}>{Array.from({ length: 5 }, (_, cell) => <span className="skeleton" key={cell} />)}</div>)}
    </div>
  );
}
