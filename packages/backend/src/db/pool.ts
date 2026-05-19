/**
 * MySQL connection pool using mysql2/promise.
 * Requirement 13.1 — all data at rest encrypted with AES-256 (handled at app layer).
 * Requirement 13.2 — HTTPS/TLS enforced at the Express layer; DB connections use SSL in production.
 */

import mysql from 'mysql2/promise';

import { env } from '../config/env.js';

export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  ...(env.NODE_ENV === 'production' && { ssl: { rejectUnauthorized: true } }),
  connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 0,
  timezone: 'Z', // store/retrieve all datetimes as UTC
});

pool.on('connection', () => {
  // connection acquired — no-op, kept for future instrumentation
});

/** Run a query with automatic connection management. */
export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(text, params);
  return rows as unknown as T[];
}

/** Run multiple queries inside a single transaction. */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
