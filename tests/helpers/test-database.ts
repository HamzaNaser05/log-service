import { Pool } from "pg";

import { runMigrations } from "../../src/db/migrate.js";

const TEST_DATABASE_NAME = "log_service_test";

function requireTestEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required test environment variable: ${name}`,
    );
  }

  return value;
}

function verifyTestDatabaseUrl(
  databaseUrl: string,
): void {
  const parsedUrl = new URL(databaseUrl);

  const databaseName =
    decodeURIComponent(
      parsedUrl.pathname.slice(1),
    );

  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to run tests against database '${databaseName}'`,
    );
  }
}

export async function createTestDatabase(): Promise<Pool> {
  const adminDatabaseUrl = requireTestEnv(
    "TEST_ADMIN_DATABASE_URL",
  );

  const testDatabaseUrl = requireTestEnv(
    "TEST_DATABASE_URL",
  );

  verifyTestDatabaseUrl(testDatabaseUrl);

  const adminPool = new Pool({
    connectionString: adminDatabaseUrl,
    max: 1,
  });

  try {
    await adminPool.query(
      "DROP DATABASE IF EXISTS log_service_test WITH (FORCE)",
    );

    await adminPool.query(
      "CREATE DATABASE log_service_test",
    );
  } finally {
    await adminPool.end();
  }

  const testPool = new Pool({
    connectionString: testDatabaseUrl,
    max: 2,
  });

  try {
    await runMigrations(testPool);

    return testPool;
  } catch (error: unknown) {
    await testPool.end();
    throw error;
  }
}

export async function destroyTestDatabase(
  testPool: Pool,
): Promise<void> {
  await testPool.end();

  const adminDatabaseUrl = requireTestEnv(
    "TEST_ADMIN_DATABASE_URL",
  );

  const adminPool = new Pool({
    connectionString: adminDatabaseUrl,
    max: 1,
  });

  try {
    await adminPool.query(
      "DROP DATABASE IF EXISTS log_service_test WITH (FORCE)",
    );
  } finally {
    await adminPool.end();
  }
}