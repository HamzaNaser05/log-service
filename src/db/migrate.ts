import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Pool, PoolClient } from "pg";

type Migration = {
  version: number;
  name: string;
  checksum: string;
  sql: string;
};

type AppliedMigrationRow = {
  version: number;
  name: string;
  checksum: string;
};

const MIGRATION_DIRECTORY = resolve(process.cwd(), "migrations");

const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;

const MIGRATION_LOCK_KEY = 42_424_242;

async function loadMigrations(): Promise<Migration[]> {
  const entries = await readdir(MIGRATION_DIRECTORY, {
    withFileTypes: true,
  });

  const migrations: Migration[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const match = MIGRATION_FILE_PATTERN.exec(entry.name);

    if (match === null) {
      continue;
    }

    const versionText = match[1];
    const migrationName = match[2];

    if (versionText === undefined || migrationName === undefined) {
      throw new Error(`Invalid migration filename: ${entry.name}`);
    }

    const version = Number.parseInt(versionText, 10);

    const filePath = resolve(MIGRATION_DIRECTORY, entry.name);
    const sql = await readFile(filePath, "utf8");

    const checksum = createHash("sha256")
      .update(sql)
      .digest("hex");

    migrations.push({
      version,
      name: migrationName,
      checksum,
      sql,
    });
  }

  migrations.sort((left, right) => left.version - right.version);

  for (let index = 1; index < migrations.length; index += 1) {
    const previous = migrations[index - 1];
    const current = migrations[index];

    if (previous === undefined || current === undefined) {
      continue;
    }

    if (previous.version === current.version) {
      throw new Error(
        `Duplicate migration version: ${current.version}`,
      );
    }
  }

  return migrations;
}

async function ensureMigrationTable(
  client: PoolClient,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(
  client: PoolClient,
): Promise<Map<number, AppliedMigrationRow>> {
  const result = await client.query<AppliedMigrationRow>(`
    SELECT version, name, checksum
    FROM schema_migrations
    ORDER BY version
  `);

  return new Map(
    result.rows.map((migration) => [
      migration.version,
      migration,
    ]),
  );
}

function verifyAppliedMigration(
  migration: Migration,
  applied: AppliedMigrationRow,
): void {
  if (migration.name !== applied.name) {
    throw new Error(
      `Migration ${migration.version} name does not match the applied migration`,
    );
  }

  if (migration.checksum !== applied.checksum) {
    throw new Error(
      `Migration ${migration.version} was modified after being applied`,
    );
  }
}

async function applyMigration(
  client: PoolClient,
  migration: Migration,
): Promise<void> {
  await client.query(migration.sql);

  await client.query(
    `
      INSERT INTO schema_migrations (
        version,
        name,
        checksum
      )
      VALUES ($1, $2, $3)
    `,
    [
      migration.version,
      migration.name,
      migration.checksum,
    ],
  );
}

export async function runMigrations(pool: Pool): Promise<void> {
  const migrations = await loadMigrations();

  const client = await pool.connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      "SELECT pg_advisory_xact_lock($1::bigint)",
      [MIGRATION_LOCK_KEY],
    );

    await ensureMigrationTable(client);

    const appliedMigrations =
      await getAppliedMigrations(client);

    for (const migration of migrations) {
      const applied = appliedMigrations.get(
        migration.version,
      );

      if (applied !== undefined) {
        verifyAppliedMigration(migration, applied);
        continue;
      }

      await applyMigration(client, migration);
    }

    await client.query("COMMIT");
  } catch (error: unknown) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError: unknown) {
        console.error(
          "Migration rollback failed",
          rollbackError,
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }
}