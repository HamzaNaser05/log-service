import {
    describe,
    expect,
    test,
} from "vitest";

import type {
    LogAggregateFilters,
} from "../../src/domain/log-aggregate.js";

import {
    buildLogAggregateQuery,
} from "../../src/query/log-aggregate-query.js";

function createFilters(
    overrides:
        Partial<LogAggregateFilters> = {},
): LogAggregateFilters {
    return {
        service: null,
        level: null,

        since:
            "2026-08-09T09:00:00Z",

        until:
            "2026-08-09T12:00:00Z",

        attributeFilters: [],

        q: null,

        bucket: "1h",

        groupBy: null,

        ...overrides,
    };
}

describe(
    "buildLogAggregateQuery",
    () => {
        test(
            "parameterizes bucket and filters",
            () => {
                const query =
                    buildLogAggregateQuery(
                        createFilters({
                            service:
                                "checkout",

                            level: "error",

                            attributeFilters: [
                                {
                                    key: "region",
                                    value: "eu-west",
                                },
                            ],

                            q: "payment",
                        }),
                    );

                expect(query.text).toContain(
                    "date_bin($1::interval",
                );

                expect(query.text).toContain(
                    "service = $2",
                );

                expect(query.text).toContain(
                    "level = $3",
                );

                expect(query.values).toEqual([
                    "1 hour",
                    "checkout",
                    "error",
                    "2026-08-09T09:00:00Z",
                    "2026-08-09T12:00:00Z",
                    `{"region":"eu-west"}`,
                    "%payment%",
                ]);
            },
        );

        test(
            "groups by service using an internal SQL expression",
            () => {
                const query =
                    buildLogAggregateQuery(
                        createFilters({
                            groupBy: "service",
                        }),
                    );

                expect(query.text).toContain(
                    "service AS group_value",
                );

                expect(query.values).not
                    .toContain("service");

                expect(query.text).toContain(
                    "FROM log_second_rollups AS rollup",
                );

                expect(query.text).not.toContain(
                    "OR log.timestamp",
                );
            },
        );

        test(
            "groups by level",
            () => {
                const query =
                    buildLogAggregateQuery(
                        createFilters({
                            groupBy: "level",
                        }),
                    );

                expect(query.text).toContain(
                    "level AS group_value",
                );
            },
        );

        test(
            "uses a null group when grouping is absent",
            () => {
                const query =
                    buildLogAggregateQuery(
                        createFilters(),
                    );

                expect(query.text).toContain(
                    "NULL::text AS group_value",
                );
            },
        );

        test(
            "falls back to raw logs when message filtering needs raw dimensions",
            () => {
                const query =
                    buildLogAggregateQuery(
                        createFilters({
                            q: "declined",
                        }),
                    );

                expect(query.text).toContain(
                    "FROM logs",
                );

                expect(query.text).not.toContain(
                    "log_second_rollups",
                );

            },
        );
    },
);
