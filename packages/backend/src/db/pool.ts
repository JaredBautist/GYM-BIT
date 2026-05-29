import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve DB path — if relative, resolve from backend package root
const dbPath = path.isAbsolute(env.DATABASE_URL)
  ? env.DATABASE_URL
  : path.resolve(__dirname, '..', '..', env.DATABASE_URL);

// Ensure the directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Performance & safety pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export { db };

/** Run a query and return all matching rows. */
export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const stmt = db.prepare(text);
  const upper = text.trim().toUpperCase();
  if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('PRAGMA')) {
    const rows = (params ? stmt.all(...params) : stmt.all()) as T[];
    return rows;
  }
  stmt.run(...(params ?? []));
  return [] as T[];
}

/** Run multiple queries inside a single transaction. */
export async function withTransaction<T>(
  fn: (conn: { execute: (sql: string, params?: unknown[]) => Promise<Database.RunResult> }) => Promise<T>,
): Promise<T> {
  db.exec('BEGIN');
  try {
    const fakeConn = {
      execute: (sql: string, params?: unknown[]) => {
        return Promise.resolve(db.prepare(sql).run(...(params ?? [])));
      },
    };
    const result = await fn(fakeConn);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
