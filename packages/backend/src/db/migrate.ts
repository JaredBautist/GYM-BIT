/**
 * Simple migration runner using mysql2.
 * Tracks applied migrations in a `schema_migrations` table.
 *
 * Usage:
 *   node dist/db/migrate.js           — apply pending migrations
 *   node dist/db/migrate.js rollback  — not implemented (manual rollback via SQL)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mysql from 'mysql2/promise';

import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(conn: mysql.Connection): Promise<void> {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(conn: mysql.Connection): Promise<Set<string>> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    'SELECT filename FROM schema_migrations ORDER BY id',
  );
  return new Set(rows.map((r) => r['filename'] as string));
}

async function applyMigration(
  conn: mysql.Connection,
  filename: string,
  sql: string,
): Promise<void> {
  // Split on semicolons so we can run each statement individually
  // (mysql2 does not support multi-statement strings by default)
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await conn.beginTransaction();
  try {
    for (const stmt of statements) {
      await conn.execute(stmt);
    }
    await conn.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
    await conn.commit();
    console.log(`  ✓ Applied: ${filename}`);
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

async function runMigrations(): Promise<void> {
  const conn = await mysql.createConnection({
    uri: env.DATABASE_URL,
    ...(env.NODE_ENV === 'production' && { ssl: { rejectUnauthorized: true } }),
    multipleStatements: false,
  });

  try {
    await ensureMigrationsTable(conn);
    const applied = await getAppliedMigrations(conn);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await applyMigration(conn, file, sql);
      count++;
    }

    if (count === 0) {
      console.log('No pending migrations.');
    } else {
      console.log(`\n${count} migration(s) applied successfully.`);
    }
  } finally {
    await conn.end();
  }
}

const command = process.argv[2];
if (command === 'rollback') {
  console.error('Rollback is not automated. Apply rollback SQL manually.');
  process.exit(1);
} else {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
