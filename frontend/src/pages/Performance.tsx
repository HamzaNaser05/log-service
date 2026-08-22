import { Icon } from "../components/Icons";
import { PageHeader } from "../components/ui";

const progression = [
  { label: "Official baseline", value: 4.63, display: "~4.6k", note: "Most recent 120-second grading run", tone: "muted" },
  { label: "Final clean load", value: 6.03, display: "~6.0k", note: "724,317 accepted over 120 seconds", tone: "clean" },
  { label: "Final stress", value: 5.54, display: "~5.5k", note: "Database grew past 1.5 million rows", tone: "info" },
  { label: "Final spike", value: 5.78, display: "~5.8k", note: "Zero errors during the 30k offered burst", tone: "best" },
] as const;

const datasetRuns = [
  { logs: 724_317, throughput: 6.03 },
  { logs: 1_563_959, throughput: 5.54 },
  { logs: 2_706_293, throughput: 5.78 },
  { logs: 3_350_702, throughput: 5.32 },
] as const;

export function Performance() {
  const maxProgression = 16;
  const maxThroughput = 7;

  return (
    <>
      <PageHeader
        eyebrow="Measured engineering"
        title="Performance"
        description="Documented benchmark results under fixed CPU, memory, and PostgreSQL durability constraints."
      />

      <section className="performance-hero">
        <article className="result-card clean-result">
          <div className="result-label"><span className="result-icon"><Icon name="check" /></span>Final 120-second load</div>
          <div className="result-value">6.03k <small>logs/sec</small></div>
          <p>724,317 accepted logs, zero HTTP errors, and 100% read-after-write success.</p>
          <span className="target-delta">Target not yet met</span>
        </article>
        <article className="result-card best-result">
          <div className="result-label"><span className="result-icon"><Icon name="performance" /></span>Primary aggregation p95</div>
          <div className="result-value">91 <small>ms</small></div>
          <p>Down from the official 1,130 ms load result through compact exact-second rollups.</p>
          <span className="target-delta">Below 400 ms query threshold</span>
        </article>
        <aside className="distinction-note">
          <Icon name="alert" />
          <div><strong>Measured, not marketed</strong><p>All four stock scenarios ran against one database that grew to 3.35 million rows.</p></div>
        </aside>
      </section>

      <div className="performance-grid">
        <section className="panel benchmark-panel">
          <div className="panel-heading"><div><span className="section-kicker">Optimization path</span><h2>Benchmark progression</h2></div><span className="target-key"><i />15k target</span></div>
          <div className="progression-chart">
            <div className="target-line" style={{ left: `${(15 / maxProgression) * 100}%` }}><span>Target</span></div>
            {progression.map((result) => (
              <div className="bar-row" key={result.label}>
                <div className="bar-copy"><strong>{result.label}</strong><span>{result.note}</span></div>
                <div className="bar-track"><div className={`bar-fill bar-${result.tone}`} style={{ width: `${(result.value / maxProgression) * 100}%` }} /></div>
                <div className="bar-value">{result.display}<small> logs/sec</small></div>
              </div>
            ))}
          </div>
          <p className="chart-footnote">Target: 15,000 logs/sec. PostgreSQL durability remained enabled throughout testing.</p>
        </section>

        <section className="panel concurrency-panel">
          <div className="panel-heading"><div><span className="section-kicker">Dataset growth</span><h2>Consecutive exact-workload runs</h2></div></div>
          <div className="concurrency-callout"><span>33</span><div><strong>Logs per HTTP batch</strong><p>The shared generator caps ingestion at 70 virtual users.</p></div></div>
          <div className="concurrency-chart">
            {datasetRuns.map((result) => (
              <div className="concurrency-row selected" key={result.logs}>
                <span className="concurrency-label">{Math.round(result.logs / 1000)}k</span>
                <div className="concurrency-track"><div style={{ width: `${(result.throughput / maxThroughput) * 100}%` }} /></div>
                <strong>{result.throughput.toFixed(2)}k</strong>
                <span className="best-badge">Stable</span>
              </div>
            ))}
          </div>
          <p className="chart-footnote">Every selected run had zero HTTP errors and 100% read-after-write visibility as the dataset grew.</p>
        </section>
      </div>

      <section className="panel resource-panel">
        <div className="panel-heading"><div><span className="section-kicker">Fixed test envelope</span><h2>Resource constraints</h2></div><span className="durability-badge"><Icon name="database" />Durability enabled</span></div>
        <div className="resource-grid">
          <article className="resource-card"><span className="resource-icon"><Icon name="server" /></span><div><span>Application</span><strong>0.5 CPU</strong><strong>256 MB</strong></div></article>
          <article className="resource-card postgres-resource"><span className="resource-icon"><Icon name="database" /></span><div><span>PostgreSQL 16</span><strong>1 CPU</strong><strong>1 GB</strong></div></article>
          <article className="resource-detail"><Icon name="cpu" /><div><strong>Performance context</strong><p>Text COPY, one measured writer lane, 33-log HTTP batches, and transactional second rollups. <code>fsync</code>, <code>synchronous_commit</code>, and <code>full_page_writes</code> remained on.</p></div></article>
        </div>
      </section>
    </>
  );
}
