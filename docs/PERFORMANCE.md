# Performance Report

## Test environment

Measurements in this document were made on 2026-08-22 with the same Compose
limits used by the assignment:

| Container | Limit |
|---|---:|
| Application | 0.5 CPU, 256 MiB RAM |
| PostgreSQL 16 | 1 CPU, 1 GiB RAM |

PostgreSQL remained the durable source of truth. These settings were left on:

```text
fsync = on
synchronous_commit = on
full_page_writes = on
```

No successful HTTP response was sent before its raw-log COPY and minute-rollup
update committed.

## Exact shared-generator workload

The regression used
`https://github.com/HasanZawahra/load-generator`, specifically its
`performance.js` workload:

- HTTP batch size: 33 logs
- ingestion target: 15,000 logs/sec
- maximum ingestion VUs: 70
- aggregation: 1 request/sec
- read-after-write: 23 iterations/sec at the 15k target
- aggregation query: `bucket=1m&group_by=service`
- log dimensions: 12 services, 4 levels, 6 regions, and 4 attributes
- high-cardinality attributes: random `user_id` and `request_id`

The full grader also runs load, stress, spike, and breakpoint scenarios. The
local optimization loop used shorter 20- and 30-second runs so variants could
be compared quickly. Those short results must not be read as a new official
four-scenario score.

## Baseline from the grading report

The submitted commit's official load scenario reported:

| Metric | Baseline |
|---|---:|
| Accepted logs | 544,896 |
| Throughput | 4,540.8 logs/sec |
| Ingestion p95 | 801.3 ms |
| Aggregation p95 | 870.9 ms |
| HTTP errors | 0 |

The stress, spike, and breakpoint scenarios fell to roughly 3.5k–4.3k
logs/sec, and the worst aggregation p95 reached 2.64 seconds. The query score
was zero because its sustained aggregation p95 threshold is 400 ms.

## Final local regression

The final indexed design uses two text-COPY lanes, a 50 ms batching window, a
2,000-log immediate-flush threshold, and transactional minute rollups.

A clean 30-second exact-workload run produced:

| Metric | Result |
|---|---:|
| Accepted logs | 194,964 |
| Throughput | 6,433.39 logs/sec |
| Ingestion p95 | 479.60 ms |
| Aggregation p95 | 205.11 ms |
| Read query p95 | 186.36 ms |
| Read-after-write success | 100% |
| HTTP errors | 0 |

A second 30-second run started with those rows still present:

| Metric | Result |
|---|---:|
| Final dataset | 391,864 logs |
| Dataset size | 196 MiB including partition indexes |
| Rollup size | 192 rows / 184 KiB |
| Throughput | 6,414.05 logs/sec |
| Ingestion p95 | 528.96 ms |
| Aggregation p95 | 305.53 ms |
| Read-after-write success | 100% |
| HTTP errors | 0 |

A live resource snapshot during the second run was:

| Container | CPU | Memory |
|---|---:|---:|
| Application | 36.18% | 40.98 MiB |
| PostgreSQL | 79.62% | 250.6 MiB |

This is a meaningful improvement over the official baseline and puts the
primary aggregation back under the query-score threshold. It does **not** meet
the required 15,000 logs/sec target; a full official rerun is still required.

## Experiments and decisions

Short runs were used only for relative comparison. The most useful results
were:

| Variant | Throughput | Aggregation p95 | Decision |
|---|---:|---:|---|
| Original indexed raw aggregation | 4,540.8/s | 870.9 ms | Replace aggregation path |
| Rollup, one writer, indexed | 4,774/s | 377 ms | Keep rollup |
| No message GIN | 5,190/s | 176 ms | Reject: substring queries regress at scale |
| No GIN indexes | 5,390/s | 214 ms | Reject: violates query-performance intent |
| Two writers, no GIN | 6,653/s | 191 ms | Keep two-writer model |
| Three writers, no GIN | 6,563/s | 289 ms | Reject: no gain, less query headroom |
| Durable staging prototype | 6,511/s | 182 ms | Reject: complexity without useful gain |
| Final indexed, two writers | 6,433/s | 205 ms | Selected |

The text-COPY encoder was retained because the indexed comparison was
materially faster than the application-heavy binary encoder in this 0.5-CPU
container. PostgreSQL had more CPU headroom than Node during that comparison.

## Bottlenecks discovered

1. Raw aggregation repeatedly grouped an ever-growing current-day partition.
2. One serial writer left PostgreSQL I/O overlap on the table.
3. Fastify info-level access logs emitted two JSON lines per request and spent
   part of the small application CPU budget on benchmark noise.
4. The binary encoder allocated many small Buffers and reparsed timestamps.
5. Attribute and message GIN indexes have real write cost, but removing them
   only produced a modest short-run gain and made required query patterns worse.
6. PostgreSQL was the dominant resource in the final indexed run.

## Optimizations applied

- Transactional minute counts grouped by service, level, and writer shard.
- Exact hybrid aggregation: rollups for complete minutes and raw scans for only
  the partial range edges.
- Raw fallback for `q` and attribute aggregation filters.
- Two leased COPY connections with a queue-wide concurrency bound of two.
- Writer-sharded rollup primary key to avoid hot-row contention.
- 50 ms / 2,000-log microbatch calibration with a 5,000-log hard maximum.
- One text-COPY payload allocation per microbatch.
- Reuse of the timestamp epoch computed during validation.
- Warn-level production logging; failures remain logged, access noise does not.
- Rollup cleanup and cutoff-minute reconstruction in retention maintenance.

## How to reproduce

Start the service from a clean checkout:

```bash
docker compose up --build
```

Then run the shared generator's `performance.js` with:

```text
BASE_URL=http://host.docker.internal:8080
SCENARIO=load
BATCH=33
MAX_VUS=70
TARGET_LOG_RATE=15000
DURATION_SEC=30
```

For a submission-quality result, omit the duration/rate overrides and run all
four stock scenarios against one continuously growing database. Record the
generator summary and `docker stats` output.

## Remaining limitations

- The measured ingestion rate remains below 15k logs/sec.
- The final result is a short regression, not a complete official load/stress/
  spike/breakpoint rerun.
- Attribute- or message-filtered aggregation cannot use the dimension-limited
  rollup and therefore depends on raw-table indexes.
- GIN maintenance is a deliberate write/read trade-off and is expected to be a
  major cost at multi-million-row scale.
