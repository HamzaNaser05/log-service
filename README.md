# High-Throughput Log Service

A production-oriented log ingestion and query service built with **Node.js, TypeScript, Fastify, and PostgreSQL 16**.

The system is designed to ingest structured logs at high throughput while preserving durability, supporting flexible filtering, deterministic cursor pagination, time-bucket aggregation, automatic partition management, and bounded memory usage.

## Highlights

- Binary PostgreSQL `COPY` ingestion
- Bounded in-memory ingestion queue
- Micro-batching
- Dedicated PostgreSQL writer connection
- Per-entry validation with partial batch acceptance
- Daily UTC PostgreSQL partitions
- Automatic partition creation
- Configurable retention
- JSONB attributes with normalized searchable representation
- GIN indexing for arbitrary attribute equality
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

Using:

- 100,000 initial logs
- HTTP batch size: 100
- Binary COPY
- Micro-batching
- 32 concurrent ingestion clients
- PostgreSQL durability enabled

Observed results included:

| Metric | Result |
|---|---:|
| Clean ingestion throughput | ~17.5k logs/sec |
| Best observed throughput | ~21.3k logs/sec |
| Required target | 15k logs/sec |
| Failed ingestion batches | 0 |
| Aggregation p95 during ingestion | < 1 second |

PostgreSQL durability remained enabled during testing:

```text
fsync = on
synchronous_commit = on
full_page_writes = on
```

The performance work was measurement-driven rather than based on disabling durability guarantees.

Detailed benchmark methodology and results are documented separately in the performance milestone.

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
                         Dedicated COPY Writer
                                    │
                                    ▼
                      PostgreSQL Binary COPY
                                    │
                                    ▼
                       ┌─────────────────────┐
                       │    PostgreSQL 16    │
                       │                     │
                       │ Daily partitions    │
                       │ JSONB attributes    │
                       │ B-tree indexes      │
                       │ GIN index           │
                       └──────────┬──────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
               GET /logs             GET /logs/aggregate
                    │                           │
             Keyset pagination              date_bin()
```

---

# Why Binary COPY?

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
single dedicated writer
     ↓
PostgreSQL COPY FROM STDIN
     ↓
one transaction
```

Multiple HTTP batches can therefore share one database COPY operation.

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

A GIN index supports arbitrary attribute equality filters.

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

Create the local environment file:

```bash
cp .env.example .env
```

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

---

# Local Development

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
- Binary COPY rollback
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
