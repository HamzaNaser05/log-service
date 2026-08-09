import { defineConfig } from "vitest/config";

const DEFAULT_TEST_DATABASE_URL =
  "postgresql://log_service:log_service@localhost:5432/log_service_test";

const DEFAULT_TEST_ADMIN_DATABASE_URL =
  "postgresql://log_service:log_service@localhost:5432/postgres";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        DEFAULT_TEST_DATABASE_URL,

      TEST_ADMIN_DATABASE_URL:
        process.env.TEST_ADMIN_DATABASE_URL ??
        DEFAULT_TEST_ADMIN_DATABASE_URL,
    },
  },
});