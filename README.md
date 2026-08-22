# High-Throughput Log Service

A production-oriented log ingestion and query service built with **Node.js, TypeScript, Fastify, and PostgreSQL 16**.

The system is designed to ingest structured logs at high throughput while preserving durability, supporting flexible filtering, deterministic cursor pagination, time-bucket aggregation, automatic partition management, and bounded memory usage.

## Highlights

- PostgreSQL text `COPY` ingestion
- Bounded in-memory ingestion queue
- Micro-batching
- Dedicated PostgreSQL writer connection
- Dedicated PostgreSQL aggregation connection
- Per-entry validation with partial batch acceptance
- Daily UTC PostgreSQL partitions
- Automatic partition creation
- Configurable retention
- JSONB attributes with normalized searchable representation
- Selective GIN indexing for attribute equality
- Deterministic keyset pagination
- Literal case-insensitive message search
- Time-bucket aggregation
- Backpressure with `503 + Retry-After`
- Graceful shutdown and queue draining
- Strict TypeScript
- Real PostgreSQL integration tests
- GitHub Actions CI
- Docker Compose deployment
- React + TypeScript operations dashboard

---

## Operations Dashboard

The professional demonstration UI lives in `frontend/` and uses only the service's existing API contracts. It includes an overview, cursor-paginated log explorer, database-backed analytics, and the documented performance story.

Start the complete stack:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

The dashboard defaults to the same-origin `/api` proxy. Its API base URL and automatic refresh interval can be changed from **Settings**. For local frontend development, run `npm --prefix frontend install` once and then `npm run frontend:dev`; Vite proxies `/api` to `http://localhost:8080` by default.

---

## Performance

The service was benchmarked under constrained resources:

| Component | Limit |
|---|---:|
| Application | 0.5 CPU / 256 MB RAM |
| PostgreSQL | 1 CPU / 1 GB RAM |

The final regression used the shared generator's four stock scenarios without
duration overrides: batch size 33, 70 maximum ingestion VUs, one aggregation
per second, and concurrent read-after-write checks. All four ran against one
continuously growing database, which finished with 3,350,702 raw logs.

| Scenario | Accepted | Logs/sec | Ingest p95 | Aggregate p95 | Visibility | HTTP errors |
|---|---:|---:|---:|---:|---:|---:|
| Load (120 s at 15k offered) | 724,317 | 6,030 | 542 ms | 91 ms | 100% | 0 |
| Stress (15k → 30k offered) | 833,448 | 5,536 | 638 ms | 368 ms | 100% | 0 |
| Spike (7.5k → 30k → 7.5k) | 579,744 | 5,785 | 539 ms | 363 ms | 100% | 0 |
| Breakpoint (15k → 45k offered) | 641,652 | 5,319 | 607 ms | 428 ms | 100% | 0 |

After the stress run, at 1,563,959 rows, the application used 41.62 MiB and
PostgreSQL used 286.7 MiB. The compact rollup contained 3,384 rows / 744 KiB.
At the end of all scenarios PostgreSQL used 479.1 MiB, within the 1 GiB limit.

The most recent official baseline accepted 4,631 logs/sec in its load scenario
and reported 1,130 ms aggregation p95; its stress aggregation p95 was 2,923 ms.
The local full run therefore improved load throughput by about 30% and stress
aggregation by about 8x. It still does not meet the aspirational 15,000
logs/sec target, and official infrastructure can produce different numbers.

PostgreSQL durability remained enabled during testing:

```text
fsync = on
synchronous_commit = on
full_page_writes = on
```

The performance work was measurement-driven rather than based on disabling durability guarantees.

The important bottlenecks were raw-table aggregation, high-cardinality GIN
maintenance, checkpoint churn, unnecessary insert-triggered vacuum scans, and
application-heavy binary payload construction. The final design uses compact
transactional second rollups, one calibrated text-COPY lane, a selective
attribute GIN, a reserved aggregation connection, and conservative PostgreSQL
checkpoint tuning. Detailed evidence is in `docs/PERFORMANCE.md`.

---

# Architecture

```text
                        Client
                          │
                          ▼
                  ┌──────────────┐
                  │   Fastify    │
                  │ HTTP Server  │
                  └──────┬───────┘
                         │
                         ▼
                  Request Validation
                         │
              ┌──────────┴──────────┐
              │                     │
         invalid logs          valid logs
              │                     │
              ▼                     ▼
        rejection result      Bounded Queue
                                    │
                                    ▼
                              Micro-batching
                                    │
                                    ▼
                            One COPY Writer
                                    │
                                    ▼
                       PostgreSQL Text COPY
                                    │
                                    ▼
                       ┌─────────────────────┐
                       │    PostgreSQL 16    │
                       │                     │
                       │ Daily partitions    │
                       │ JSONB attributes    │
                       │ B-tree indexes      │
                       │ GIN indexes         │
                       │ Second rollups      │
                       └──────────┬──────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
               GET /logs             GET /logs/aggregate
                    │                           │
             Keyset pagination          second rollups +
                                        exact edge scan
```

---

# Why COPY and one writer lane?

The initial implementation used parameterized per-row `INSERT` statements inside a transaction.

That implementation provided strong correctness, but each HTTP batch required many SQL executions.

The optimized ingestion path uses:

```text
HTTP requests
     ↓
bounded queue
     ↓
microbatch
     ↓
one leased writer connection
     ↓
PostgreSQL COPY FROM STDIN
     ↓
one transaction
```

Multiple HTTP batches can therefore share one database COPY operation.

One calibrated writer was faster in the final indexed workload because a
second lane competed with aggregation on the one-CPU PostgreSQL container.
The schema retains a writer-shard key so `INGESTION_WRITER_COUNT` can be raised
for experiments without hot-row conflicts, but the measured default is one.

An HTTP request is not acknowledged as successful until its microbatch has committed successfully.

If COPY fails, the transaction is rolled back and every affected request receives a failure.

---

# Database Design

Logs are stored in a PostgreSQL partitioned table.

Important columns include:

```text
id
timestamp
level
service
message
attributes
attributes_normalized
```

## Partitioning

The table uses UTC daily range partitions.

Example:

```text
logs_2026_08_14
logs_2026_08_15
logs_2026_08_16
```

Partitions are created automatically ahead of time.

Retention removes fully expired partitions efficiently and performs a bounded delete only inside the cutoff-day partition when necessary.

The small second-rollup table is retained in the same maintenance transaction.
The cutoff second is rebuilt from retained raw rows, keeping fractional-second
retention exact.

---

## Attributes

The API accepts arbitrary flat attributes:

```json
{
  "region": "eu-west",
  "retries": 3,
  "premium": true
}
```

Two representations are stored:

```text
attributes
```

Preserves the original JSON types.

```text
attributes_normalized
```

Normalizes scalar values to strings for consistent equality filtering.

Example:

```json
{
  "region": "eu-west",
  "retries": "3",
  "premium": "true"
}
```

A compact expression GIN supports arbitrary attribute equality filters except
`request_id` and `user_id`. Those two generator-defined high-cardinality keys
were responsible for most GIN write amplification, so they use parameterized
JSON extraction instead. The API behavior is unchanged; ID-only searches can
be slower than other attribute searches.

Message substring search uses a trigram GIN index. The primary key supports the
deterministic `(timestamp, id)` order, while
`(service, timestamp DESC, id DESC)` supports the most common filtered query and
the load generator's read-after-write check.

## Aggregation rollups

`log_second_rollups` stores one row per second, service, and writer shard, with
four fixed counters for `debug`, `info`, `warn`, and `error`. Ingestion updates
it in the same transaction as raw logs. Aggregations without `q` or attribute
filters read this compact table; only the first and last fractional seconds use
raw logs, preserving exact inclusive/exclusive boundaries. Message- or
attribute-filtered aggregations fall back to indexed raw logs because those
dimensions are not present in the rollup.

---

# Pagination

`GET /logs` does not use `OFFSET`.

Results are ordered by:

```sql
timestamp DESC,
id DESC
```

Pagination uses an opaque cursor representing the last returned:

```text
(timestamp, id)
```

The next query uses keyset pagination:

```sql
(timestamp, id) < (cursor_timestamp, cursor_id)
```

This provides deterministic pagination even when multiple logs have identical timestamps.

---

# Backpressure

The ingestion queue has a fixed maximum capacity.

If the service cannot safely accept more logs, it returns:

```http
503 Service Unavailable
Retry-After: 1
```

The system does not allow unlimited requests to accumulate in memory.

---

# Graceful Shutdown

On `SIGINT` or `SIGTERM`:

```text
stop partition maintenance
        ↓
stop accepting new HTTP traffic
        ↓
finish in-flight HTTP requests
        ↓
drain ingestion queue
        ↓
release COPY writer
        ↓
close PostgreSQL pool
        ↓
exit
```

The process does not immediately terminate while committed or pending ingestion work is still being handled.

---

# Tech Stack

| Area | Technology |
|---|---|
| Runtime | Node.js 22 |
| Language | TypeScript |
| HTTP | Fastify |
| Database | PostgreSQL 16 |
| Database driver | `pg` |
| High-throughput ingestion | `pg-copy-streams` |
| Testing | Vitest |
| Containers | Docker Compose |
| CI | GitHub Actions |

No ORM is used.

Database queries are handwritten and parameterized.

---

# Quick Start

## Requirements

You need:

```text
Docker
Docker Compose
```

Clone the repository and enter the project directory.

Start the system:

```bash
docker compose up --build
```

The service listens on:

```text
http://localhost:8080
```

Check health:

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{
  "status": "ok"
}
```

No environment file, authentication header, rate-limit setup, database
creation, or manual migration command is required. Plain `docker compose up`
provides the four required endpoints on `localhost:8080`.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `RETENTION_DAYS` | `7` | Raw-log and rollup retention window |
| `PARTITION_AHEAD_DAYS` | `2` | UTC partitions created ahead |
| `INGESTION_QUEUE_MAX_LOGS` | `25000` | Bounded queued + in-flight logs |
| `INGESTION_MICROBATCH_MAX_LOGS` | `5000` | Maximum logs in one COPY |
| `INGESTION_MICROBATCH_MAX_WAIT_MS` | `50` | Maximum batching delay |
| `INGESTION_MICROBATCH_FLUSH_LOGS` | `2000` | Immediate-flush threshold |
| `INGESTION_WRITER_COUNT` | `1` | Parallel durable COPY lanes (`1`–`4`) |
| `INGESTION_RETRY_AFTER_SECONDS` | `1` | Backpressure retry hint |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed dashboard origins |

## Optional features

The operations dashboard is additive and enabled by the Compose `frontend`
service on `localhost:3000`. It does not alter the required API. Authentication,
API keys, multi-tenancy, quotas, and rate limiting are not implemented, so the
default service is unauthenticated and imposes no grader-facing quota.

## Known limitations

- The exact shared-generator regression remains below the 15k logs/sec target.
- Second rollups accelerate service/level aggregations; `q` and attribute
  aggregations still scan indexed raw logs.
- `request_id`-only and `user_id`-only filters use JSON extraction rather than
  the smaller searchable-attribute GIN and can be slower over broad ranges.
- Daily partitions make retention efficient, but the cutoff-day partial delete
  can create some bloat until PostgreSQL vacuums that partition.
- Writer concurrency above one did not improve the final constrained indexed
  benchmark and can reduce query headroom.

---

# Local Development

Create the development configuration. Unlike Docker Compose, `npm start` runs
on the host and therefore uses `localhost` for PostgreSQL:

```bash
cp .env.example .env
```

Install dependencies:

```bash
npm ci
```

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Build:

```bash
npm run build
```

Run:

```bash
npm start
```

---

# Validation

Run application type checking:

```bash
npm run typecheck
```

Run test type checking:

```bash
npm run typecheck:test
```

Build:

```bash
npm run build
```

Run the complete test suite:

```bash
npm test
```

---

# API

The service exposes four primary endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Database/service health |
| POST | `/logs` | Ingest structured logs |
| GET | `/logs` | Query and paginate logs |
| GET | `/logs/aggregate` | Time-bucket aggregation |

Full API documentation:

```text
docs/API.md
```

---

# Correctness Guarantees

The implementation and test suite cover:

- malformed JSON
- invalid timestamps
- timestamps too far in the future
- invalid levels
- nested attributes
- partial batch acceptance
- all-invalid batches
- parameterized SQL
- injection-shaped values
- literal wildcard characters in message search
- corrupted cursors
- deterministic same-timestamp pagination
- no pagination duplicates
- no pagination omissions
- aggregation buckets
- grouping
- partition creation
- retention boundaries
- text COPY rollback
- writer recovery after rollback
- database failures
- ingestion backpressure
- graceful shutdown
- queue draining

---

# CI

Every push and pull request runs a GitHub Actions workflow using:

```text
Node.js 22
PostgreSQL 16
```

The pipeline runs:

```text
npm ci
npm run typecheck
npm run typecheck:test
npm run build
npm test
```

Performance benchmarks are intentionally excluded from normal CI because benchmark results depend on host resources.

---

# Project Philosophy

The project follows several engineering rules:

1. Measure before optimizing.
2. Change one performance variable at a time.
3. Never report success before durable database commit.
4. Never expose PostgreSQL internals to API clients.
5. Keep ingestion memory bounded.
6. Prefer deterministic keyset pagination over `OFFSET`.
7. Preserve PostgreSQL durability during performance testing.
8. Add indexes only when evidence justifies their write cost.
9. Treat graceful shutdown and database failure behavior as part of correctness.
