import { Icon } from "../components/Icons";
import { PageHeader } from "../components/ui";

const progression = [
  { label: "Official submission", value: 4.54, display: "~4.5k", note: "120-second shared-generator load run", tone: "muted" },
  { label: "Rollup, one writer", value: 4.77, display: "~4.8k", note: "Aggregation moved off the raw table", tone: "info" },
  { label: "Final clean regression", value: 6.43, display: "~6.4k", note: "Indexed text COPY with two writers", tone: "clean" },
  { label: "Final populated regression", value: 6.41, display: "~6.4k", note: "391,864 rows after the run", tone: "best" },
] as const;

const datasetRuns = [
  { logs: 194_964, throughput: 6.43 },
  { logs: 391_864, throughput: 6.41 },
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
          <div className="result-label"><span className="result-icon"><Icon name="check" /></span>Final clean regression</div>
          <div className="result-value">6.43k <small>logs/sec</small></div>
          <p>194,964 accepted logs, zero HTTP errors, and 100% read-after-write success.</p>
          <span className="target-delta">Target not yet met</span>
        </article>
        <article className="result-card best-result">
          <div className="result-label"><span className="result-icon"><Icon name="performance" /></span>Primary aggregation p95</div>
          <div className="result-value">205 <small>ms</small></div>
          <p>Down from the official 870.9 ms load result through exact minute rollups.</p>
          <span className="target-delta">Below 400 ms query threshold</span>
        </article>
        <aside className="distinction-note">
          <Icon name="alert" />
          <div><strong>Measured, not marketed</strong><p>These are short regression runs. The README clearly separates them from the full official benchmark.</p></div>
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
          <p className="chart-footnote">Throughput remained stable as the indexed dataset grew from 195k to 392k rows.</p>
        </section>
      </div>

      <section className="panel resource-panel">
        <div className="panel-heading"><div><span className="section-kicker">Fixed test envelope</span><h2>Resource constraints</h2></div><span className="durability-badge"><Icon name="database" />Durability enabled</span></div>
        <div className="resource-grid">
          <article className="resource-card"><span className="resource-icon"><Icon name="server" /></span><div><span>Application</span><strong>0.5 CPU</strong><strong>256 MB</strong></div></article>
          <article className="resource-card postgres-resource"><span className="resource-icon"><Icon name="database" /></span><div><span>PostgreSQL 16</span><strong>1 CPU</strong><strong>1 GB</strong></div></article>
          <article className="resource-detail"><Icon name="cpu" /><div><strong>Performance context</strong><p>Text COPY, two bounded writer lanes, 33-log HTTP batches, and transactional minute rollups. <code>fsync</code>, <code>synchronous_commit</code>, and <code>full_page_writes</code> remained on.</p></div></article>
        </div>
      </section>
    </>
  );
}
