# Log Service API

Base URL:

```text
http://localhost:8080
```

All request and response bodies use JSON unless otherwise noted.

---

# GET /health

Checks whether the application can communicate with PostgreSQL.

## Success

```http
GET /health
```

Response:

```http
200 OK
```

```json
{
  "status": "ok"
}
```

If PostgreSQL is unavailable, the endpoint returns:

```http
503 Service Unavailable
```

---

# POST /logs

Ingest one or more structured log entries.

## Request

```http
POST /logs
Content-Type: application/json
```

Example:

```json
{
  "logs": [
    {
      "timestamp": "2026-08-14T20:30:00.123456Z",
      "level": "error",
      "service": "checkout",
      "message": "Payment declined",
      "attributes": {
        "region": "eu-west",
        "retries": 3,
        "premium": true
      }
    }
  ]
}
```

---

## Log Fields

### timestamp

Required.

Must be a valid ISO-8601 timestamp containing a timezone.

Examples:

```text
2026-08-14T20:30:00Z
2026-08-14T20:30:00.123456Z
2026-08-14T23:30:00+03:00
```

A timestamp cannot be more than five minutes in the future.

---

### level

Required.

Allowed values:

```text
debug
info
warn
error
```

---

### service

Required non-empty string.

Example:

```json
{
  "service": "checkout"
}
```

---

### message

Required non-empty string.

Example:

```json
{
  "message": "Payment declined"
}
```

---

### attributes

Optional.

Must be a flat JSON object.

Allowed values:

```text
string
number
boolean
```

Example:

```json
{
  "attributes": {
    "region": "eu-west",
    "retries": 3,
    "premium": true
  }
}
```

Nested objects and arrays are rejected.

---

# Partial Batch Acceptance

Each log entry is validated independently.

Example:

```json
{
  "logs": [
    {
      "timestamp": "2026-08-14T20:30:00Z",
      "level": "info",
      "service": "api",
      "message": "Valid log"
    },
    {
      "timestamp": "invalid",
      "level": "info",
      "service": "api",
      "message": "Invalid log"
    }
  ]
}
```

The valid entry may still be committed even though its sibling is rejected.

The response contains:

```text
accepted
rejected
```

The `rejected` collection identifies validation failures for individual batch entries.

---

## Successful ingestion

If at least one valid log is durably committed:

```http
200 OK
```

Example:

```json
{
  "accepted": 1,
  "rejected": []
}
```

A `200` response is sent only after PostgreSQL successfully commits the ingestion transaction.

---

## Invalid request

If the top-level body is invalid or every log is rejected:

```http
400 Bad Request
```

Malformed JSON also returns:

```http
400 Bad Request
```

---

## Backpressure

If the bounded ingestion queue is full:

```http
503 Service Unavailable
Retry-After: 1
```

Example:

```json
{
  "error": "log ingestion busy"
}
```

Clients should retry later.

---

## Database failure

If durable storage cannot be completed:

```http
503 Service Unavailable
```

Example:

```json
{
  "error": "log ingestion unavailable"
}
```

PostgreSQL error messages, SQL statements, credentials, and stack traces are not exposed to the client.

---

# GET /logs

Queries stored logs.

Results are returned newest first using:

```text
timestamp DESC
id DESC
```

---

## Query Parameters

### service

Exact service equality.

```http
GET /logs?service=checkout
```

---

### level

Allowed values:

```text
debug
info
warn
error
```

Example:

```http
GET /logs?level=error
```

---

### since

Inclusive lower timestamp bound.

Conceptually:

```sql
timestamp >= since
```

Example:

```http
GET /logs?since=2026-08-14T18:00:00Z
```

---

### until

Exclusive upper timestamp bound.

Conceptually:

```sql
timestamp < until
```

Example:

```http
GET /logs?until=2026-08-15T00:00:00Z
```

---

### attr.<key>

Filters arbitrary normalized attributes using equality.

Example:

```http
GET /logs?attr.region=eu-west
```

Multiple attribute filters are combined with `AND`.

Example:

```text
attr.region=eu-west
attr.retries=3
```

means:

```text
region == "eu-west"
AND
retries == "3"
```

---

### q

Case-insensitive literal substring search against the message.

Example:

```http
GET /logs?q=payment
```

Characters such as:

```text
%
_
\
```

are treated literally rather than as uncontrolled SQL wildcard input.

---

### limit

Maximum number of logs returned.

Default:

```text
100
```

Maximum:

```text
1000
```

Example:

```http
GET /logs?limit=250
```

---

### cursor

Opaque pagination cursor returned by a previous request.

Example:

```http
GET /logs?limit=100&cursor=<opaque-value>
```

Clients should not decode, modify, or construct cursors themselves.

---

# Pagination

The service uses keyset pagination rather than `OFFSET`.

Initial request:

```http
GET /logs?service=checkout&limit=100
```

Example response structure:

```json
{
  "logs": [
    {
      "id": "123",
      "timestamp": "2026-08-14T20:30:00.123456Z",
      "level": "error",
      "service": "checkout",
      "message": "Payment declined",
      "attributes": {
        "region": "eu-west"
      }
    }
  ],
  "next_cursor": "opaque-cursor-value"
}
```

Next page:

```http
GET /logs?service=checkout&limit=100&cursor=<next_cursor>
```

The cursor is based on:

```text
timestamp
id
```

This prevents duplicate or missing rows when several logs have identical timestamps.

---

# Filter Combination

Filters are composable.

Example:

```text
GET /logs
  ?service=checkout
  &level=error
  &since=2026-08-14T18:00:00Z
  &until=2026-08-15T00:00:00Z
  &attr.region=eu-west
  &q=payment
  &limit=100
```

All supplied filters are combined using `AND`.

---

# Invalid Query Parameters

Invalid examples include:

```text
unsupported level
invalid timestamp
limit above 1000
invalid cursor
duplicate scalar parameters
unknown query parameters
```

These return:

```http
400 Bad Request
```

---

# GET /logs/aggregate

Returns counts grouped into time buckets.

Both `since` and `until` are required.

---

## Required Parameters

### since

Inclusive lower bound.

### until

Exclusive upper bound.

### bucket

Allowed values:

```text
1m
5m
1h
1d
```

Example:

```http
GET /logs/aggregate?since=2026-08-14T18:00:00Z&until=2026-08-15T00:00:00Z&bucket=5m
```

PostgreSQL `date_bin()` is used to calculate bucket boundaries.

---

# Optional Grouping

`group_by` may be:

```text
service
level
```

Example:

```http
GET /logs/aggregate?since=2026-08-14T18:00:00Z&until=2026-08-15T00:00:00Z&bucket=1h&group_by=service
```

The result contains bucket counts, with the requested group dimension when grouping is enabled.

---

# Aggregate Filters

Aggregation supports the same common filters as log queries:

```text
service
level
attr.<key>
q
```

Example:

```text
GET /logs/aggregate
  ?since=2026-08-14T18:00:00Z
  &until=2026-08-15T00:00:00Z
  &bucket=5m
  &group_by=service
  &level=error
  &attr.region=eu-west
  &q=payment
```

Pagination parameters such as:

```text
limit
cursor
```

are not supported on the aggregation endpoint.

---

# Time Semantics

The API uses:

```text
since → inclusive
until → exclusive
```

Equivalent SQL semantics:

```sql
timestamp >= since
AND timestamp < until
```

Daily partitions use UTC boundaries.

---

# Error Summary

| Scenario | Status |
|---|---:|
| Successful ingestion | 200 |
| Successful query | 200 |
| Successful aggregation | 200 |
| Invalid JSON | 400 |
| Invalid log batch | 400 |
| Invalid query | 400 |
| Invalid cursor | 400 |
| Ingestion queue full | 503 |
| PostgreSQL ingestion failure | 503 |
| PostgreSQL query failure | 503 |
| Health DB failure | 503 |

---

# Example curl Commands

## Health

```bash
curl http://localhost:8080/health
```

## Ingest

```bash
curl \
  -X POST \
  http://localhost:8080/logs \
  -H 'content-type: application/json' \
  -d '{
    "logs": [
      {
        "timestamp": "2026-08-14T20:30:00Z",
        "level": "info",
        "service": "api",
        "message": "Request completed",
        "attributes": {
          "region": "eu-west"
        }
      }
    ]
  }'
```

## Query

```bash
curl \
  'http://localhost:8080/logs?service=api&limit=100'
```

## Attribute Filter

```bash
curl \
  'http://localhost:8080/logs?attr.region=eu-west'
```

## Message Search

```bash
curl \
  'http://localhost:8080/logs?q=payment'
```

## Aggregate

```bash
curl \
  'http://localhost:8080/logs/aggregate?since=2026-08-14T18:00:00Z&until=2026-08-15T00:00:00Z&bucket=5m&group_by=service'
```