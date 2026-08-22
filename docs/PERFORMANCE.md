# Performance Report

## Test environment

Measurements were taken on 2026-08-22 with the assignment's Compose limits:

| Container | Limit |
|---|---:|
| Application | 0.5 CPU, 256 MiB RAM |
| PostgreSQL 16 | 1 CPU, 1 GiB RAM |

PostgreSQL remained the durable source of truth. `fsync`,
`synchronous_commit`, and `full_page_writes` stayed enabled. An ingest request
was never acknowledged before both raw logs and their rollups committed.

## Workload

The benchmark used the stock `performance.js` from
`https://github.com/HasanZawahra/load-generator`:

- batch size 33 and 70 maximum ingest VUs;
- one aggregation request per second;
- concurrent read-after-write checks;
- `bucket=1m&group_by=service` for the primary aggregation;
- 12 services, 4 levels, 6 regions, and 4 attributes;
- random high-cardinality `user_id` and `request_id` values.

All four scenarios ran sequentially against one continuously growing database.
The clean load started at zero rows; the breakpoint run finished at 3,350,702
raw rows.

## Results

| Scenario | Accepted | Logs/sec | Ingest p95 | Aggregate p95 | Read p95 | Visibility | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| Load, 120 s at 15k offered | 724,317 | 6,030.14 | 541.81 ms | 91.34 ms | 125.71 ms | 100% | 0 |
| Stress, 15k to 30k | 833,448 | 5,535.76 | 637.51 ms | 368.04 ms | 150.94 ms | 100% | 0 |
| Spike, 7.5k to 30k to 7.5k | 579,744 | 5,784.54 | 538.66 ms | 363.26 ms | 118.04 ms | 100% | 0 |
| Breakpoint, 15k to 45k | 641,652 | 5,318.89 | 607.47 ms | 427.73 ms | 178.28 ms | 100% | 0 |

The generator reached its 70-VU cap, so accepted throughput was capacity-limited
and lower than offered load. The service returned no failed requests and
maintained complete read-after-write visibility in the selected final runs.

After stress, at 1,563,959 raw rows:

| Measurement | Value |
|---|---:|
| Application memory | 41.62 MiB |
| PostgreSQL memory | 286.7 MiB |
| Second-rollup rows | 3,384 |
| Second-rollup total size | 744 KiB |
| Hot-partition attribute GIN | 8.0 MiB |

After all scenarios PostgreSQL used 479.1 MiB. The application remained far
below its 256 MiB limit.

## Baseline comparison

The most recent official baseline reported 555,753 accepted load logs,
4,631.28 logs/sec, 840.23 ms ingest p95, and 1,129.97 ms aggregate p95. Its
stress throughput was 3,958.46 logs/sec with 2,923 ms aggregate p95. The final
local design improved load throughput by about 30%, load aggregation by about
12x, and stress aggregation by about 8x. A new official run is still required
because host behavior varies.

## Bottlenecks found

1. Raw-table aggregation repeatedly grouped a growing current-day partition.
2. One row per second/service/level caused four times more rollup writes and
   scans than one row containing four fixed level counters.
3. A full JSONB GIN was dominated by unique `request_id` and `user_id` values.
4. Frequent requested checkpoints generated avoidable write pressure.
5. PostgreSQL's insert-triggered autovacuum scanned the append-only hot
   partition even though it contained no dead tuples; one such scan caused an
   8.26-second spike outlier during an intermediate run.
6. Additional writer lanes competed with the primary aggregation on the
   one-CPU PostgreSQL container.
7. Application-built binary COPY payloads cost more CPU than text COPY in the
   0.5-CPU application container.

## Optimizations retained

- Text `COPY FROM STDIN` with a bounded, 50 ms microbatch queue.
- One measured writer by default; writer-sharded rollup keys retain safe
  configurability without making extra concurrency the default.
- Transactional second rollups with one row per second/service/shard and four
  level counters.
- Exact hybrid aggregation: rollups for complete seconds and two independent
  raw edge scans for fractional boundary seconds.
- A dedicated one-connection aggregate pool with a 30-second queue timeout.
- Raw fallback for message- and attribute-filtered aggregations.
- Expression GIN over searchable attributes excluding `request_id` and
  `user_id`; those two keys use parameterized JSON extraction.
- Trigram GIN retained for required case-insensitive message substrings.
- `max_wal_size=4GB`, 15-minute checkpoint timeout, and 0.9 completion target;
  durability settings remain on.
- Insert-triggered vacuum disabled only for append-only daily partitions.
  Dead-tuple vacuum, autoanalyze, and anti-wraparound protection remain.
- Rollup deletion and exact cutoff-second reconstruction during retention.

## Rejected experiments

| Experiment | Decision |
|---|---|
| Remove the message GIN | Faster writes, rejected because broad substring queries regress |
| Remove all attribute indexing | Faster writes, rejected because arbitrary attribute queries regress |
| Two or three synchronous writers | Rejected after reducing aggregation headroom on one PostgreSQL CPU |
| Additional synchronous 10-second hierarchy | Rejected because extra writes made stress aggregation much worse |
| Deferred rollup maintenance | Correct and reliable, but slower than the compact synchronous design |
| Full GIN including random IDs | Rejected due to large high-cardinality write amplification |

## Reproduction

Start a clean stack:

```bash
docker compose down -v
docker compose up --build -d --wait
```

Run the generator's unmodified `performance.js` once for each stock scenario,
using:

```text
BASE_URL=http://host.docker.internal:8080
BATCH=33
MAX_VUS=70
SCENARIO=load | stress | spike | breakpoint
```

Run the scenarios in that order without truncating the database. Capture each
k6 summary plus `docker stats --no-stream` and PostgreSQL relation statistics.

## Remaining limitations

- Measured ingestion is reliable but remains below the 15,000 logs/sec target.
- Breakpoint aggregation p95 was 428 ms when offered load reached 45,000
  logs/sec; the required sustained and spike runs remained below 400 ms.
- Message- or attribute-filtered aggregation reads indexed raw logs because
  those dimensions are intentionally absent from the compact rollup.
- Broad `request_id`-only or `user_id`-only searches can be slower than other
  attribute filters because those keys are excluded from the expression GIN.
- The cutoff-day retention delete can create temporary bloat until normal
  dead-tuple vacuum processes that partition.
