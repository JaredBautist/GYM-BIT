/**
 * Inicialización y gestión de la base de datos SQLite local.
 * Usa expo-sqlite para acceso nativo en iOS y Android.
 *
 * Requirements: 12.1, 12.5
 */

import * as SQLite from 'expo-sqlite';

import { CREATE_TABLES_SQL } from './schema';

// ── Singleton de la base de datos ─────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Obtiene la instancia singleton de la base de datos SQLite.
 * Crea las tablas si no existen (primera ejecución).
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  _db = await SQLite.openDatabaseAsync('gymbit.db');

  // Habilitar WAL mode para mejor rendimiento concurrente
  await _db.execAsync('PRAGMA journal_mode = WAL;');
  await _db.execAsync('PRAGMA foreign_keys = ON;');

  // Crear todas las tablas del esquema local
  for (const sql of CREATE_TABLES_SQL) {
    await _db.execAsync(sql);
  }

  return _db;
}

/**
 * Cierra la conexión a la base de datos (útil en tests).
 */
export async function closeDatabase(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
}

/**
 * Ejecuta una query de lectura y devuelve los resultados tipados.
 */
export async function dbQuery<T>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  const db = await getDatabase();
  return db.getAllAsync<T>(sql, params);
}

/**
 * Ejecuta una query de escritura (INSERT, UPDATE, DELETE).
 */
export async function dbRun(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<SQLite.SQLiteRunResult> {
  const db = await getDatabase();
  return db.runAsync(sql, params);
}

/**
 * Ejecuta múltiples queries en una transacción atómica.
 */
export async function dbTransaction(
  operations: Array<{ sql: string; params?: (string | number | null)[] }>,
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const op of operations) {
      await db.runAsync(op.sql, op.params ?? []);
    }
  });
}
