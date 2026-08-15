import { Icon } from "../components/Icons";
import { PageHeader } from "../components/ui";

const progression = [
  { label: "Transactional INSERT baseline", value: 1.83, display: "~1.8k", note: "Per-row INSERTs in a transaction", tone: "muted" },
  { label: "Binary COPY", value: 14.16, display: "~14.2k", note: "Binary COPY + bounded queue", tone: "info" },
  { label: "Clean tuned run", value: 17.48, display: "~17.5k", note: "Clean measured result", tone: "clean" },
  { label: "Best observed run", value: 21.34, display: "~21.3k", note: "Best observed result", tone: "best" },
] as const;

const concurrency = [
  { clients: 4, throughput: 15.77 },
  { clients: 8, throughput: 15.84 },
  { clients: 16, throughput: 18.29 },
  { clients: 32, throughput: 21.34 },
  { clients: 64, throughput: 19.06 },
] as const;

export function Performance() {
  const maxProgression = 22;
  const maxConcurrency = 22;

  return (
    <>
      <PageHeader
        eyebrow="Measured engineering"
        title="Performance"
        description="Documented benchmark results under fixed CPU, memory, and PostgreSQL durability constraints."
      />

      <section className="performance-hero">
        <article className="result-card clean-result">
          <div className="result-label"><span className="result-icon"><Icon name="check" /></span>Clean measured result</div>
          <div className="result-value">17.5k <small>logs/sec</small></div>
          <p>17,481.22 logs/sec in an isolated repeat after resetting PostgreSQL statistics.</p>
          <span className="target-delta">16.5% above target</span>
        </article>
        <article className="result-card best-result">
          <div className="result-label"><span className="result-icon"><Icon name="performance" /></span>Best observed result</div>
          <div className="result-value">21.3k <small>logs/sec</small></div>
          <p>21,335.13 logs/sec at benchmark client concurrency 32.</p>
          <span className="target-delta">42% above target</span>
        </article>
        <aside className="distinction-note">
          <Icon name="alert" />
          <div><strong>Measured, not marketed</strong><p>The clean repeatable measurement is presented separately from the highest single observed run.</p></div>
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
          <div className="panel-heading"><div><span className="section-kicker">Saturation test</span><h2>Client concurrency experiment</h2></div></div>
          <div className="concurrency-callout"><span>32</span><div><strong>Benchmark client concurrency</strong><p>Concurrent ingestion clients—not server threads or processors.</p></div></div>
          <div className="concurrency-chart">
            {concurrency.map((result) => (
              <div className={`concurrency-row ${result.clients === 32 ? "selected" : ""}`} key={result.clients}>
                <span className="concurrency-label">{result.clients}</span>
                <div className="concurrency-track"><div style={{ width: `${(result.throughput / maxConcurrency) * 100}%` }} /></div>
                <strong>{result.throughput.toFixed(2)}k</strong>
                {result.clients === 32 && <span className="best-badge">Best</span>}
              </div>
            ))}
          </div>
          <p className="chart-footnote">Throughput peaked at 32 clients; increasing to 64 reduced useful throughput to 19.06k logs/sec.</p>
        </section>
      </div>

      <section className="panel resource-panel">
        <div className="panel-heading"><div><span className="section-kicker">Fixed test envelope</span><h2>Resource constraints</h2></div><span className="durability-badge"><Icon name="database" />Durability enabled</span></div>
        <div className="resource-grid">
          <article className="resource-card"><span className="resource-icon"><Icon name="server" /></span><div><span>Application</span><strong>0.5 CPU</strong><strong>256 MB</strong></div></article>
          <article className="resource-card postgres-resource"><span className="resource-icon"><Icon name="database" /></span><div><span>PostgreSQL 16</span><strong>1 CPU</strong><strong>1 GB</strong></div></article>
          <article className="resource-detail"><Icon name="cpu" /><div><strong>Performance context</strong><p>Binary COPY, a bounded queue, micro-batching, and 100-log HTTP batches. <code>fsync</code>, <code>synchronous_commit</code>, and <code>full_page_writes</code> remained on.</p></div></article>
        </div>
      </section>
    </>
  );
}
