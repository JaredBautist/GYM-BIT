/**
 * IndexedDB — almacenamiento local para la versión web PWA.
 * Misma estructura de tablas que SQLite en el cliente móvil (sección 4.3 del diseño).
 *
 * Requirements: 12.1, 12.2, 12.5
 */

const DB_NAME = 'gymbit_db';
const DB_VERSION = 1;

// ── Store names (equivalentes a las tablas SQLite del móvil) ──────────────────

export const STORES = {
  USERS_CACHE: 'users_cache',
  WORKOUT_PLAN_CACHE: 'workout_plan_cache',
  SESSIONS_LOCAL: 'sessions_local',
  SERIE_LOGS_LOCAL: 'serie_logs_local',
  FOODS_CACHE: 'foods_cache',
  DAILY_RECORDS_LOCAL: 'daily_records_local',
  FOOD_LOGS_LOCAL: 'food_logs_local',
  SLEEP_RECORDS_LOCAL: 'sleep_records_local',
  OFFLINE_QUEUE: 'offline_queue',
} as const;

// ── DB singleton ──────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // users_cache
      if (!db.objectStoreNames.contains(STORES.USERS_CACHE)) {
        db.createObjectStore(STORES.USERS_CACHE, { keyPath: 'id' });
      }

      // workout_plan_cache
      if (!db.objectStoreNames.contains(STORES.WORKOUT_PLAN_CACHE)) {
        const store = db.createObjectStore(STORES.WORKOUT_PLAN_CACHE, { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: false });
      }

      // sessions_local
      if (!db.objectStoreNames.contains(STORES.SESSIONS_LOCAL)) {
        const store = db.createObjectStore(STORES.SESSIONS_LOCAL, { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: false });
        store.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // serie_logs_local
      if (!db.objectStoreNames.contains(STORES.SERIE_LOGS_LOCAL)) {
        const store = db.createObjectStore(STORES.SERIE_LOGS_LOCAL, { keyPath: 'id' });
        store.createIndex('session_id', 'session_id', { unique: false });
      }

      // foods_cache
      if (!db.objectStoreNames.contains(STORES.FOODS_CACHE)) {
        const store = db.createObjectStore(STORES.FOODS_CACHE, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('barcode', 'barcode', { unique: false });
      }

      // daily_records_local
      if (!db.objectStoreNames.contains(STORES.DAILY_RECORDS_LOCAL)) {
        const store = db.createObjectStore(STORES.DAILY_RECORDS_LOCAL, { keyPath: 'id' });
        store.createIndex('user_date', ['user_id', 'record_date'], { unique: true });
      }

      // food_logs_local
      if (!db.objectStoreNames.contains(STORES.FOOD_LOGS_LOCAL)) {
        const store = db.createObjectStore(STORES.FOOD_LOGS_LOCAL, { keyPath: 'id' });
        store.createIndex('meal_id', 'meal_id', { unique: false });
      }

      // sleep_records_local
      if (!db.objectStoreNames.contains(STORES.SLEEP_RECORDS_LOCAL)) {
        const store = db.createObjectStore(STORES.SLEEP_RECORDS_LOCAL, { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: false });
      }

      // offline_queue
      if (!db.objectStoreNames.contains(STORES.OFFLINE_QUEUE)) {
        const store = db.createObjectStore(STORES.OFFLINE_QUEUE, { keyPath: 'id' });
        store.createIndex('user_processed', ['user_id', 'is_processed'], { unique: false });
        store.createIndex('client_timestamp', 'client_timestamp', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
  });
}

// ── Generic CRUD helpers ──────────────────────────────────────────────────────

export async function idbPut<T>(storeName: string, item: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
