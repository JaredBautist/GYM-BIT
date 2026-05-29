import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool, query } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INT PRIMARY KEY AUTO_INCREMENT,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const rows = await query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY id',
  );
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(filename: string, sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of statements) {
      await conn.execute(stmt);
    }
    await conn.execute(
      'INSERT INTO schema_migrations (filename) VALUES (?)',
      [filename],
    );
    await conn.commit();
    console.log(`  ✓ Applied: ${filename}`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await applyMigration(file, sql);
    count++;
  }

  if (count === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`\n${count} migration(s) applied successfully.`);
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
