import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureMigrationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function getAppliedMigrations(): Set<string> {
  const rows = db.prepare('SELECT filename FROM schema_migrations ORDER BY id').all() as {
    filename: string;
  }[];
  return new Set(rows.map((r) => r.filename));
}

function applyMigration(filename: string, sql: string): void {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const runMigration = db.transaction(() => {
    for (const stmt of statements) {
      db.exec(stmt);
    }
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(filename);
  });

  runMigration();
  console.log(`  ✓ Applied: ${filename}`);
}

function runMigrations(): void {
  ensureMigrationsTable();
  const applied = getAppliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    applyMigration(file, sql);
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
  runMigrations();
}
