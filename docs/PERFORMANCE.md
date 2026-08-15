# Performance Report

## 1. Objective

The log service was designed to support high-throughput structured log ingestion while preserving:

- PostgreSQL durability
- bounded application memory
- deterministic querying
- concurrent aggregation
- database-backed correctness
- graceful failure behavior

The primary performance target was:

```text
>= 15,000 logs/second
```

while operating under constrained resources:

| Component | Resource Limit |
|---|---:|
| Application | 0.5 CPU / 256 MB RAM |
| PostgreSQL | 1 CPU / 1 GB RAM |

A second important requirement was:

```text
Aggregation p95 < 1 second
while ingestion is active
```

Performance tuning was performed incrementally.

Only one major variable was changed at a time whenever possible.

---

# 2. Test Environment

The benchmark environment used Docker Compose.

Application:

```text
Node.js 22
Fastify
TypeScript
0.5 CPU
256 MB RAM
```

Database:

```text
PostgreSQL 16
1 CPU
1 GB RAM
```

PostgreSQL durability remained enabled:

```text
fsync = on
synchronous_commit = on
full_page_writes = on
```

The performance target was therefore not achieved by disabling PostgreSQL durability guarantees.

---

# 3. Benchmark Workload

The primary tuning workload used:

```text
Initial logs:       100,000
HTTP batch size:    100 logs
Query iterations:   100
Mixed-load logs:    20,000
```

The workload measured:

- ingestion throughput
- ingestion batch p50
- ingestion batch p95
- ingestion batch p99
- failed batches
- service query latency
- literal message search latency
- aggregation latency
- ingestion throughput while reads were active

The same benchmark harness was reused across optimization experiments.

---

# 4. Initial Architecture

The first correct ingestion implementation used:

```text
HTTP Batch
    ↓
Validation
    ↓
BEGIN
    ↓
INSERT log #1
INSERT log #2
INSERT log #3
...
INSERT log #N
    ↓
COMMIT
```

Each row required an individual PostgreSQL statement.

This architecture was intentionally implemented first because it provided a simple correctness baseline.

---

# 5. Initial Performance Baseline

An early 10,000-log baseline using transactional per-row INSERTs produced approximately:

```text
1,830.96 logs/sec
```

with:

| Metric | Result |
|---|---:|
| Accepted logs | 10,000 |
| Rejected logs | 0 |
| Failed batches | 0 |
| Ingestion p50 | 161.97 ms |
| Ingestion p95 | 608.38 ms |
| Ingestion p99 | 693.95 ms |

This established that the system was correct, but the ingestion path was far below the required throughput.

---

# 6. Binary COPY Optimization

The ingestion architecture was redesigned around:

```text
HTTP Requests
      ↓
Bounded Queue
      ↓
Micro-batching
      ↓
Dedicated PostgreSQL Writer
      ↓
COPY FROM STDIN
FORMAT BINARY
      ↓
COMMIT
```

Important properties were preserved:

- requests are not acknowledged before commit
- failed COPY operations are rolled back
- affected requests fail together
- queue capacity is bounded
- PostgreSQL still generates log IDs
- timestamp microsecond precision is preserved
- original JSON attribute types are preserved
- normalized searchable attributes are preserved

---

# 7. Binary COPY Result

A 100,000-log benchmark after introducing Binary COPY produced:

```text
14,156.79 logs/sec
```

Results:

| Metric | Result |
|---|---:|
| Accepted logs | 100,000 |
| Rejected logs | 0 |
| Failed batches | 0 |
| Ingestion p50 | 22.37 ms |
| Ingestion p95 | 65.15 ms |
| Ingestion p99 | 99.01 ms |

This represented a major improvement over the per-row INSERT architecture, but remained slightly below the 15k logs/sec target.

---

# 8. Micro-batch Flush Tuning

The original queue configuration used the same value for:

```text
when a microbatch should immediately flush
```

and:

```text
maximum number of logs allowed in a COPY
```

These concerns were separated.

The tuned configuration became:

```text
flush threshold = 400 logs
maximum COPY batch = 1000 logs
maximum wait = 5 ms
```

This allowed four concurrent 100-log HTTP batches to trigger a COPY immediately rather than unnecessarily waiting for the timer.

With concurrency 4:

```text
15,769.89 logs/sec
```

This was the first run to exceed the required:

```text
15,000 logs/sec
```

without changing durability or resource limits.

---

# 9. Concurrency Saturation Experiment

Client concurrency was then varied while keeping the server configuration unchanged.

Results:

| Concurrency | Throughput |
|---:|---:|
| 4 | 15,769.89 logs/sec |
| 8 | 15,842.19 logs/sec |
| 16 | 18,293.47 logs/sec |
| 32 | **21,335.13 logs/sec** |
| 64 | 19,059.61 logs/sec |

The saturation curve showed that throughput continued improving until approximately 32 concurrent ingestion clients.

At concurrency 64:

- throughput decreased
- ingestion latency increased significantly
- mixed-load latency became worse

Therefore:

```text
Concurrency 32
```

was selected as the best observed operating point.

This choice was based on measurement rather than simply selecting the highest possible concurrency.

---

# 10. Concurrency 32 Results

The best observed 100,000-log benchmark produced:

```text
21,335.13 logs/sec
```

with:

| Metric | Result |
|---|---:|
| Accepted logs | 100,000 |
| Rejected logs | 0 |
| Failed batches | 0 |
| Ingestion p50 | 144.29 ms |
| Ingestion p95 | 217.29 ms |
| Ingestion p99 | 310.92 ms |

Read performance after ingestion:

| Query | p95 |
|---|---:|
| Service query | 62.46 ms |
| Literal substring search | 111.35 ms |
| Aggregation | 121.07 ms |

---

# 11. Mixed Workload

At the best observed concurrency-32 run, ingestion continued while queries and aggregation were executed.

Mixed workload results:

| Metric | Result |
|---|---:|
| Ingestion throughput | 9,259.91 logs/sec |
| Ingestion p95 | 606.39 ms |
| Service query p95 | 389.58 ms |
| Aggregation p95 | **696.81 ms** |

The aggregation requirement remained satisfied:

```text
696.81 ms < 1000 ms
```

while ingestion was active.

---

# 12. Concurrency 64 Saturation

Increasing concurrency further to 64 produced:

```text
19,059.61 logs/sec
```

instead of 21,335.13 logs/sec.

Ingestion p95 increased to:

```text
564.70 ms
```

and mixed ingestion p95 increased to:

```text
1,648.44 ms
```

This demonstrated that concurrency 64 had moved beyond the useful saturation point.

The system was performing more concurrent work but completing less useful work per second.

---

# 13. COPY Batch Size Experiment

The maximum COPY microbatch size was also tested at:

```text
2000 logs
```

instead of:

```text
1000 logs
```

using concurrency 32.

The result was:

```text
17,558.23 logs/sec
```

compared with the best observed:

```text
21,335.13 logs/sec
```

for a maximum COPY batch of 1000.

Therefore the larger COPY batch was rejected.

The final selected configuration remained:

```text
INGESTION_MICROBATCH_FLUSH_LOGS=400
INGESTION_MICROBATCH_MAX_LOGS=1000
INGESTION_MICROBATCH_MAX_WAIT_MS=5
INGESTION_QUEUE_MAX_LOGS=10000
```

---

# 14. Resource Bottleneck Investigation

Container statistics collected during load showed PostgreSQL consuming approximately its full 1 CPU allocation while the Node.js application used very little CPU.

Observed behavior was approximately:

```text
PostgreSQL ≈ 100% CPU allocation
Application ≈ low CPU utilization
```

This indicated that the optimized Node/Fastify ingestion path was no longer the primary bottleneck.

The bottleneck had moved toward PostgreSQL processing.

---

# 15. PostgreSQL Diagnostics

Database diagnostics showed:

```text
shared_buffers = 128 MB
wal_buffers = 4 MB
work_mem = 4 MB
gin_pending_list_limit = 4 MB
```

A diagnostic snapshot also showed a very high cumulative cache-hit percentage.

The normalized attribute GIN index was actively used by the query workload.

Therefore the GIN index was not removed merely to improve ingestion speed.

---

# 16. WAL Investigation

Initial cumulative statistics showed non-zero:

```text
wal_buffers_full
```

However, those statistics included many previous benchmark runs.

To avoid drawing the wrong conclusion, PostgreSQL statistics were reset and a clean benchmark was executed.

The clean 100,000-log run produced:

```text
17,481.22 logs/sec
```

with:

```text
100,000 accepted
0 rejected
0 failed batches
```

Clean WAL statistics were:

```text
WAL generated:     78 MB
wal_buffers_full:  0
wal_write:         160
wal_sync:          145
```

Because:

```text
wal_buffers_full = 0
```

in the isolated run, increasing `wal_buffers` was not justified by the evidence.

No WAL configuration change was retained.

---

# 17. Query Index Experiment

A PostgreSQL `pg_trgm` GIN index was experimentally created for:

```sql
message ILIKE '%payment%'
```

The query was then examined using:

```sql
EXPLAIN (ANALYZE, BUFFERS)
```

PostgreSQL did not select the trigram index for the tested query shape.

Instead, it used the existing ordered index path and returned the first 100 matching rows in approximately:

```text
0.755 ms execution time
```

Because the trigram index was not selected and would introduce additional write cost, the experimental index was removed.

No permanent trigram index was added.

---

# 18. Final Selected Configuration

The selected ingestion configuration is:

```text
Bounded queue:              10,000 logs
Flush threshold:            400 logs
Maximum COPY microbatch:    1,000 logs
Maximum wait:               5 ms
Benchmark concurrency:      32 clients
```

The architecture uses:

```text
Binary COPY
Dedicated writer connection
Bounded queue
Micro-batching
Daily partitions
GIN attribute indexing
B-tree service/time indexing
Keyset pagination
```

---

# 19. Final Performance Summary

## Defensible repeat

A clean repeated benchmark after resetting PostgreSQL statistics produced:

```text
17,481.22 logs/sec
```

This is approximately:

```text
16.5% above the required 15k logs/sec target
```

with:

```text
100% accepted
0 failed batches
PostgreSQL durability enabled
```

## Best observed result

The best observed run produced:

```text
21,335.13 logs/sec
```

which is approximately:

```text
42% above the required target
```

The project distinguishes between:

```text
clean repeatable result
```

and:

```text
best observed result
```

instead of presenting the highest single measurement as a guaranteed throughput number.

---

# 20. Optimization Progression

The overall progression was:

```text
Per-row INSERT
      │
      ▼
~1.8k logs/sec
      │
      ▼
Binary COPY
      │
      ▼
14.2k logs/sec
      │
      ▼
Separate flush threshold
      │
      ▼
15.8k logs/sec
      │
      ▼
Concurrency tuning
      │
      ▼
18.3k logs/sec
      │
      ▼
Concurrency 32
      │
      ▼
21.3k logs/sec best observed
```

This is approximately an order-of-magnitude improvement over the original ingestion implementation.

---

# 21. Engineering Decisions

Several tempting optimizations were deliberately rejected because measurements did not justify them.

## Rejected: Disable durability

Not used.

```text
fsync remained ON
synchronous_commit remained ON
full_page_writes remained ON
```

## Rejected: Unlimited queue

Not used.

Memory pressure remains bounded.

## Rejected: Concurrency 64

Higher latency and lower throughput than concurrency 32.

## Rejected: COPY batches of 2000

Lower pure ingestion throughput than batches capped at 1000.

## Rejected: Trigram message index

Not selected by the tested query planner and would add write overhead.

## Rejected: WAL buffer tuning

Clean statistics showed no WAL buffer exhaustion.

---

# 22. Conclusions

The final system exceeded the required ingestion throughput while maintaining:

- PostgreSQL durability
- zero failed batches in benchmark runs
- bounded ingestion memory
- real database indexes
- concurrent querying
- aggregation p95 below one second under ingestion
- strict correctness behavior

The most important performance lesson was that optimization was performed using measured bottlenecks.

The project did not assume that:

```text
more concurrency
larger batches
more indexes
more database memory
```

would automatically improve performance.

Each major optimization was benchmarked, compared, and either retained or rejected based on evidence.