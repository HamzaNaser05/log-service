import {
    performance,
  } from "node:perf_hooks";
  
  function readPositiveInteger(
    name,
    defaultValue,
  ) {
    const raw =
      process.env[name];
  
    if (
      raw === undefined ||
      raw.trim() === ""
    ) {
      return defaultValue;
    }
  
    if (!/^\d+$/.test(raw)) {
      throw new Error(
        `${name} must be a positive integer`,
      );
    }
  
    const value =
      Number(raw);
  
    if (
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      throw new Error(
        `${name} must be a positive integer`,
      );
    }
  
    return value;
  }
  
  const BASE_URL =
    process.env.BASE_URL ??
    "http://localhost:8080";
  
  const TOTAL_LOGS =
    readPositiveInteger(
      "BENCH_LOGS",
      10_000,
    );
  
  const BATCH_SIZE =
    readPositiveInteger(
      "BENCH_BATCH_SIZE",
      100,
    );
  
  const CONCURRENCY =
    readPositiveInteger(
      "BENCH_CONCURRENCY",
      4,
    );
  
  const QUERY_ITERATIONS =
    readPositiveInteger(
      "BENCH_QUERY_ITERATIONS",
      50,
    );
  
  const MIXED_LOGS =
    readPositiveInteger(
      "BENCH_MIXED_LOGS",
      Math.min(
        TOTAL_LOGS,
        20_000,
      ),
    );
  
  const RUN_ID =
    `bench-${Date.now().toString(36)}`;
  
  const SERVICES = [
    "checkout",
    "auth",
    "api",
    "search",
    "notifications",
  ];
  
  const LEVELS = [
    "debug",
    "info",
    "warn",
    "error",
  ];
  
  const MESSAGES = [
    "payment declined for customer",
    "request completed successfully",
    "slow request detected",
    "user login successful",
    "database operation completed",
  ];
  
  const baseTimestampMilliseconds =
    Date.now() - 60_000;
  
  const benchmarkSince =
    new Date(
      baseTimestampMilliseconds -
        2 * 60 * 60 * 1000,
    ).toISOString();
  
  const benchmarkUntil =
    new Date(
      Date.now() + 60_000,
    ).toISOString();
  
  function percentile(
    values,
    percentage,
  ) {
    if (values.length === 0) {
      return null;
    }
  
    const sorted =
      [...values].sort(
        (left, right) =>
          left - right,
      );
  
    const rank =
      Math.ceil(
        (percentage / 100) *
          sorted.length,
      ) - 1;
  
    return Number(
      sorted[
        Math.max(
          0,
          rank,
        )
      ].toFixed(2),
    );
  }
  
  function latencySummary(
    values,
  ) {
    if (values.length === 0) {
      return {
        samples: 0,
        p50_ms: null,
        p95_ms: null,
        p99_ms: null,
        average_ms: null,
      };
    }
  
    const total =
      values.reduce(
        (sum, value) =>
          sum + value,
        0,
      );
  
    return {
      samples:
        values.length,
  
      p50_ms:
        percentile(
          values,
          50,
        ),
  
      p95_ms:
        percentile(
          values,
          95,
        ),
  
      p99_ms:
        percentile(
          values,
          99,
        ),
  
      average_ms:
        Number(
          (
            total /
            values.length
          ).toFixed(2),
        ),
    };
  }
  
  function createLog(
    index,
  ) {
    const timestamp =
      new Date(
        baseTimestampMilliseconds -
          (
            index %
            3_600
          ) *
            1000,
      ).toISOString();
  
    return {
      timestamp,
  
      level:
        LEVELS[
          index %
            LEVELS.length
        ],
  
      service:
        SERVICES[
          index %
            SERVICES.length
        ],
  
      message:
        MESSAGES[
          index %
            MESSAGES.length
        ],
  
      attributes: {
        run_id:
          RUN_ID,
  
        region:
          index % 2 === 0
            ? "eu-west"
            : "us-east",
  
        retries:
          index % 5,
  
        premium:
          index % 2 === 0,
      },
    };
  }
  
  async function postBatch(
    startIndex,
    count,
  ) {
    const logs =
      Array.from(
        {
          length: count,
        },
  
        (_, offset) =>
          createLog(
            startIndex +
              offset,
          ),
      );
  
    const started =
      performance.now();
  
    let response;
  
    try {
      response =
        await fetch(
          `${BASE_URL}/logs`,
          {
            method: "POST",
  
            headers: {
              "content-type":
                "application/json",
            },
  
            body:
              JSON.stringify({
                logs,
              }),
          },
        );
    } catch (error) {
      return {
        latency:
          performance.now() -
          started,
  
        status: 0,
  
        accepted: 0,
  
        rejected: 0,
  
        error:
          error instanceof Error
            ? error.message
            : "network error",
      };
    }
  
    const latency =
      performance.now() -
      started;
  
    const text =
      await response.text();
  
    let payload = null;
  
    try {
      payload =
        JSON.parse(text);
    } catch {
      // Keep payload null.
    }
  
    if (
      response.status !== 200 ||
      payload === null
    ) {
      return {
        latency,
        status:
          response.status,
  
        accepted: 0,
        rejected: 0,
  
        error: text,
      };
    }
  
    return {
      latency,
  
      status:
        response.status,
  
      accepted:
        typeof payload.accepted ===
        "number"
          ? payload.accepted
          : 0,
  
      rejected:
        Array.isArray(
          payload.rejected,
        )
          ? payload.rejected.length
          : 0,
  
      error: null,
    };
  }
  
  async function runIngestion(
    totalLogs,
    indexOffset,
  ) {
    const batchCount =
      Math.ceil(
        totalLogs /
          BATCH_SIZE,
      );
  
    let nextBatch = 0;
  
    let accepted = 0;
    let rejected = 0;
    let failedBatches = 0;
  
    const statusCounts = {};
  
    const latencies = [];
  
    const started =
      performance.now();
  
    async function worker() {
      while (true) {
        const batchNumber =
          nextBatch;
  
        nextBatch += 1;
  
        if (
          batchNumber >=
          batchCount
        ) {
          return;
        }
  
        const localStart =
          batchNumber *
          BATCH_SIZE;
  
        const remaining =
          totalLogs -
          localStart;
  
        const count =
          Math.min(
            BATCH_SIZE,
            remaining,
          );
  
        const result =
          await postBatch(
            indexOffset +
              localStart,
            count,
          );
  
        latencies.push(
          result.latency,
        );
  
        const statusKey =
          String(
            result.status,
          );
  
        statusCounts[
          statusKey
        ] =
          (
            statusCounts[
              statusKey
            ] ?? 0
          ) + 1;
  
        accepted +=
          result.accepted;
  
        rejected +=
          result.rejected;
  
        if (
          result.status !==
          200
        ) {
          failedBatches += 1;
        }
      }
    }
  
    await Promise.all(
      Array.from(
        {
          length:
            CONCURRENCY,
        },
        () => worker(),
      ),
    );
  
    const elapsedMilliseconds =
      performance.now() -
      started;
  
    return {
      requested_logs:
        totalLogs,
  
      batch_size:
        BATCH_SIZE,
  
      concurrency:
        CONCURRENCY,
  
      accepted_logs:
        accepted,
  
      rejected_logs:
        rejected,
  
      failed_batches:
        failedBatches,
  
      status_counts:
        statusCounts,
  
      elapsed_ms:
        Number(
          elapsedMilliseconds
            .toFixed(2),
        ),
  
      logs_per_second:
        Number(
          (
            accepted /
            (
              elapsedMilliseconds /
              1000
            )
          ).toFixed(2),
        ),
  
      batch_latency:
        latencySummary(
          latencies,
        ),
    };
  }
  
  function buildUrl(
    path,
    params,
  ) {
    const url =
      new URL(
        path,
        BASE_URL,
      );
  
    for (
      const [
        key,
        value,
      ] of params
    ) {
      url.searchParams.append(
        key,
        value,
      );
    }
  
    return url.toString();
  }
  
  const serviceQueryUrl =
    buildUrl(
      "/logs",
      [
        [
          "service",
          "checkout",
        ],
        [
          "attr.run_id",
          RUN_ID,
        ],
        [
          "limit",
          "100",
        ],
      ],
    );
  
  const searchQueryUrl =
    buildUrl(
      "/logs",
      [
        [
          "q",
          "payment",
        ],
        [
          "attr.run_id",
          RUN_ID,
        ],
        [
          "limit",
          "100",
        ],
      ],
    );
  
  const aggregateUrl =
    buildUrl(
      "/logs/aggregate",
      [
        [
          "since",
          benchmarkSince,
        ],
        [
          "until",
          benchmarkUntil,
        ],
        [
          "bucket",
          "5m",
        ],
        [
          "group_by",
          "service",
        ],
        [
          "attr.run_id",
          RUN_ID,
        ],
      ],
    );
  
  async function requestOnce(
    url,
  ) {
    const started =
      performance.now();
  
    try {
      const response =
        await fetch(url);
  
      await response.arrayBuffer();
  
      return {
        latency:
          performance.now() -
          started,
  
        status:
          response.status,
      };
    } catch {
      return {
        latency:
          performance.now() -
          started,
  
        status: 0,
      };
    }
  }
  
  async function measureEndpoint(
    url,
    iterations,
  ) {
    /*
     * Small warm-up to avoid making
     * the first connection dominate
     * the measured samples.
     */
    for (
      let index = 0;
      index < 3;
      index += 1
    ) {
      await requestOnce(
        url,
      );
    }
  
    const latencies = [];
  
    let failures = 0;
  
    const statusCounts = {};
  
    for (
      let index = 0;
      index < iterations;
      index += 1
    ) {
      const result =
        await requestOnce(
          url,
        );
  
      latencies.push(
        result.latency,
      );
  
      const statusKey =
        String(
          result.status,
        );
  
      statusCounts[
        statusKey
      ] =
        (
          statusCounts[
            statusKey
          ] ?? 0
        ) + 1;
  
      if (
        result.status !==
        200
      ) {
        failures += 1;
      }
    }
  
    return {
      failures,
  
      status_counts:
        statusCounts,
  
      latency:
        latencySummary(
          latencies,
        ),
    };
  }
  
  async function run() {
    console.error(
      `Running baseline with run_id=${RUN_ID}`,
    );
  
    console.error(
      `Target logs=${TOTAL_LOGS}, batch=${BATCH_SIZE}, concurrency=${CONCURRENCY}`,
    );
  
    const ingestion =
      await runIngestion(
        TOTAL_LOGS,
        0,
      );
  
    const readOnly = {
      service_query:
        await measureEndpoint(
          serviceQueryUrl,
          QUERY_ITERATIONS,
        ),
  
      literal_search:
        await measureEndpoint(
          searchQueryUrl,
          QUERY_ITERATIONS,
        ),
  
      aggregation:
        await measureEndpoint(
          aggregateUrl,
          QUERY_ITERATIONS,
        ),
    };
  
    /*
     * Start another ingestion workload,
     * then measure GET and aggregation
     * while writes are active.
     */
    const mixedIngestionPromise =
      runIngestion(
        MIXED_LOGS,
        TOTAL_LOGS,
      );
  
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          100,
        ),
    );
  
    const [
      mixedServiceQuery,
      mixedAggregation,
      mixedIngestion,
    ] =
      await Promise.all([
        measureEndpoint(
          serviceQueryUrl,
          QUERY_ITERATIONS,
        ),
  
        measureEndpoint(
          aggregateUrl,
          QUERY_ITERATIONS,
        ),
  
        mixedIngestionPromise,
      ]);
  
    const report = {
      run_id:
        RUN_ID,
  
      generated_at:
        new Date()
          .toISOString(),
  
      configuration: {
        base_url:
          BASE_URL,
  
        initial_logs:
          TOTAL_LOGS,
  
        mixed_logs:
          MIXED_LOGS,
  
        batch_size:
          BATCH_SIZE,
  
        concurrency:
          CONCURRENCY,
  
        query_iterations:
          QUERY_ITERATIONS,
  
        since:
          benchmarkSince,
  
        until:
          benchmarkUntil,
      },
  
      ingestion_only:
        ingestion,
  
      reads_after_ingestion:
        readOnly,
  
      mixed_load: {
        ingestion:
          mixedIngestion,
  
        service_query:
          mixedServiceQuery,
  
        aggregation:
          mixedAggregation,
      },
    };
  
    console.log(
      JSON.stringify(
        report,
        null,
        2,
      ),
    );
  }
  
  await run();