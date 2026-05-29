/**
 * Inicialización y gestión de la base de datos SQLite local.
 * Usa expo-sqlite para acceso nativo en iOS y Android.
 *
 * Requirements: 12.1, 12.5
 */

import { Platform } from 'react-native';

import { CREATE_TABLES_SQL } from './schema';

// ── Singleton de la base de datos ─────────────────────────────────────────────

type SQLiteModule = typeof import('expo-sqlite');
type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;
type SQLiteRunResult = import('expo-sqlite').SQLiteRunResult;

let _db: SQLiteDatabase | null = null;
let hasWarnedWebFallback = false;

function warnWebFallback(): void {
  if (hasWarnedWebFallback) return;
  hasWarnedWebFallback = true;
  console.warn('[GymBit] SQLite local storage is disabled on web.');
}

async function loadSQLite(): Promise<SQLiteModule> {
  // expo-sqlite is a native module in this app. Importing it at module scope
  // crashes the web bundle with "Cannot find native module 'ExpoSQLite'".
  return import('expo-sqlite');
}

/**
 * Obtiene la instancia singleton de la base de datos SQLite.
 * Crea las tablas si no existen (primera ejecución).
 */
export async function getDatabase(): Promise<SQLiteDatabase | null> {
  if (Platform.OS === 'web') {
    warnWebFallback();
    return null;
  }

  if (_db) return _db;

  const SQLite = await loadSQLite();
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
  if (Platform.OS === 'web') {
    _db = null;
    return;
  }

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
  if (!db) return [];
  return db.getAllAsync<T>(sql, params);
}

/**
 * Ejecuta una query de escritura (INSERT, UPDATE, DELETE).
 */
export async function dbRun(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<SQLiteRunResult> {
  const db = await getDatabase();
  if (!db) {
    return { changes: 0, lastInsertRowId: 0 } as SQLiteRunResult;
  }
  return db.runAsync(sql, params);
}

/**
 * Ejecuta múltiples queries en una transacción atómica.
 */
export async function dbTransaction(
  operations: Array<{ sql: string; params?: (string | number | null)[] }>,
): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.withTransactionAsync(async () => {
    for (const op of operations) {
      await db.runAsync(op.sql, op.params ?? []);
    }
  });
}
