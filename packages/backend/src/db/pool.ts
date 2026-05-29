import mysql from 'mysql2/promise';

import { env } from '../config/env.js';

let _pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!_pool) {
    _pool = mysql.createPool({
      uri: env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }
  return _pool;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const pool = getPool();
  const [rows] = await pool.execute(text, params as mysql.ExecuteValues | undefined);
  return rows as T[];
}

export async function withTransaction<T>(
  fn: (conn: { execute: (sql: string, params?: unknown[]) => Promise<mysql.ResultSetHeader> }) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn({
      execute: async (sql: string, params?: unknown[]) => {
        const [result] = await conn.execute(sql, params as mysql.ExecuteValues | undefined);
        return result as mysql.ResultSetHeader;
      },
    });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
