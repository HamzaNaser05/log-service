import type {
  AggregateQuery,
  AggregateResponse,
  CommonLogFilters,
  HealthResponse,
  LogsQuery,
  LogsResponse,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return normalized || "/api";
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "Could not reach the API. Check the base URL and that the service is running.",
      0,
    );
  }

  if (!response.ok) {
    let message = `API request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { error?: unknown; status?: unknown };
      if (typeof body.error === "string") message = body.error;
      else if (typeof body.status === "string") message = body.status;
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }

    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

function appendCommonFilters(params: URLSearchParams, filters: CommonLogFilters) {
  if (filters.service) params.set("service", filters.service);
  if (filters.level) params.set("level", filters.level);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  if (filters.query) params.set("q", filters.query);

  for (const attribute of filters.attributes ?? []) {
    if (attribute.key.trim()) {
      params.set(`attr.${attribute.key.trim()}`, attribute.value);
    }
  }
}

export function getHealth(baseUrl: string, signal?: AbortSignal) {
  return requestJson<HealthResponse>(baseUrl, "/health", signal);
}

export function getLogs(baseUrl: string, query: LogsQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  appendCommonFilters(params, query);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);

  return requestJson<LogsResponse>(baseUrl, `/logs?${params.toString()}`, signal);
}

export function getAggregate(
  baseUrl: string,
  query: AggregateQuery,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  appendCommonFilters(params, query);
  params.set("bucket", query.bucket);
  if (query.groupBy) params.set("group_by", query.groupBy);

  return requestJson<AggregateResponse>(
    baseUrl,
    `/logs/aggregate?${params.toString()}`,
    signal,
  );
}
