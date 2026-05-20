/**
 * Wearable_Service — integración con dispositivos wearables.
 *
 * Responsabilidades:
 *  - Conectar/desconectar proveedores (HealthKit, Garmin Connect, Google Fit)
 *  - Sincronización manual y automática cada 30 minutos
 *  - Importar: frecuencia cardíaca, pasos, calorías quemadas, sueño, estrés, VO2max
 *  - Lógica de reintentos: notificar al usuario solo tras 3 fallos consecutivos
 *
 * Requirements: 10.1, 10.2, 10.3, 10.5
 */

import { v4 as uuidv4 } from 'uuid';

import { query, withTransaction } from '../db/pool.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type WearableProvider = 'healthkit' | 'garmin' | 'google_fit';

export interface WearableConnectionRow {
  id: string;
  user_id: string;
  provider: WearableProvider;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: Date | null;
  last_sync_at: Date | null;
  is_active: boolean | number;
  consecutive_failures: number;
}

export interface WearableDataRow {
  id: string;
  user_id: string;
  provider: WearableProvider;
  data_date: string;
  steps: number | null;
  calories_burned: number | null;
  avg_heart_rate: number | null;
  vo2max: number | null;
  stress_level: number | null;
  raw_data: string | Record<string, unknown> | null;
}

export interface ConnectWearableInput {
  provider: WearableProvider;
  accessTokenEnc: string;
  refreshTokenEnc?: string | undefined;
  tokenExpiresAt?: Date | undefined;
}

export interface WearableSyncData {
  date: string;
  steps?: number | undefined;
  caloriesBurned?: number | undefined;
  avgHeartRate?: number | undefined;
  vo2max?: number | undefined;
  stressLevel?: number | undefined;
  rawData?: Record<string, unknown> | undefined;
}

export interface SyncResult {
  provider: WearableProvider;
  success: boolean;
  recordsImported: number;
  shouldNotifyUser: boolean;
  error?: string | undefined;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Connect a wearable provider for the user.
 * Upserts the WEARABLE_CONNECTIONS row (one per user+provider).
 *
 * Requirements: 10.1
 */
export async function connectWearable(
  userId: string,
  input: ConnectWearableInput,
): Promise<WearableConnectionRow> {
  const { provider, accessTokenEnc, refreshTokenEnc, tokenExpiresAt } = input;

  // Check if connection already exists
  const existing = await query<WearableConnectionRow>(
    'SELECT * FROM wearable_connections WHERE user_id = ? AND provider = ? LIMIT 1',
    [userId, provider],
  );

  if (existing.length > 0) {
    // Update existing connection
    await query(
      `UPDATE wearable_connections
       SET access_token_enc = ?,
           refresh_token_enc = ?,
           token_expires_at = ?,
           is_active = TRUE,
           consecutive_failures = 0
       WHERE user_id = ? AND provider = ?`,
      [accessTokenEnc, refreshTokenEnc ?? null, tokenExpiresAt ?? null, userId, provider],
    );
  } else {
    // Insert new connection
    const id = uuidv4();
    await query(
      `INSERT INTO wearable_connections
         (id, user_id, provider, access_token_enc, refresh_token_enc, token_expires_at, last_sync_at, is_active, consecutive_failures)
       VALUES (?, ?, ?, ?, ?, ?, NULL, TRUE, 0)`,
      [id, userId, provider, accessTokenEnc, refreshTokenEnc ?? null, tokenExpiresAt ?? null],
    );
  }

  const rows = await query<WearableConnectionRow>(
    'SELECT * FROM wearable_connections WHERE user_id = ? AND provider = ? LIMIT 1',
    [userId, provider],
  );

  return rows[0]!;
}

/**
 * Disconnect a wearable provider for the user.
 * Sets is_active = false (soft delete to preserve sync history).
 *
 * Requirements: 10.1
 */
export async function disconnectWearable(
  userId: string,
  provider: WearableProvider,
): Promise<void> {
  const rows = await query<WearableConnectionRow>(
    'SELECT * FROM wearable_connections WHERE user_id = ? AND provider = ? AND is_active = TRUE LIMIT 1',
    [userId, provider],
  );

  if (rows.length === 0) {
    throw Object.assign(
      new Error(`No hay una conexión activa con ${provider}.`),
      { code: 'WEARABLE_NOT_CONNECTED' },
    );
  }

  await query(
    'UPDATE wearable_connections SET is_active = FALSE WHERE user_id = ? AND provider = ?',
    [userId, provider],
  );
}

/**
 * Get the status of all wearable connections for a user.
 *
 * Requirements: 10.1
 */
export async function getWearableStatus(
  userId: string,
): Promise<WearableConnectionRow[]> {
  return query<WearableConnectionRow>(
    'SELECT * FROM wearable_connections WHERE user_id = ? ORDER BY provider',
    [userId],
  );
}

/**
 * Import wearable data records for a user from a specific provider.
 * Upserts WEARABLE_DATA rows (one per user+provider+date).
 * Resets consecutive_failures counter on success.
 *
 * Requirements: 10.2, 10.3
 */
export async function importWearableData(
  userId: string,
  provider: WearableProvider,
  records: WearableSyncData[],
): Promise<number> {
  if (records.length === 0) return 0;

  let imported = 0;

  await withTransaction(async (conn) => {
    for (const record of records) {
      // Check if a row already exists for this date
      const existing = await query<{ id: string }>(
        'SELECT id FROM wearable_data WHERE user_id = ? AND provider = ? AND data_date = ? LIMIT 1',
        [userId, provider, record.date],
      );

      if (existing.length > 0) {
        // Update existing record
        await conn.execute(
          `UPDATE wearable_data
           SET steps = ?, calories_burned = ?, avg_heart_rate = ?,
               vo2max = ?, stress_level = ?, raw_data = ?
           WHERE user_id = ? AND provider = ? AND data_date = ?`,
          [
            record.steps ?? null,
            record.caloriesBurned ?? null,
            record.avgHeartRate ?? null,
            record.vo2max ?? null,
            record.stressLevel ?? null,
            record.rawData ? JSON.stringify(record.rawData) : null,
            userId,
            provider,
            record.date,
          ],
        );
      } else {
        // Insert new record
        await conn.execute(
          `INSERT INTO wearable_data
             (id, user_id, provider, data_date, steps, calories_burned, avg_heart_rate, vo2max, stress_level, raw_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            userId,
            provider,
            record.date,
            record.steps ?? null,
            record.caloriesBurned ?? null,
            record.avgHeartRate ?? null,
            record.vo2max ?? null,
            record.stressLevel ?? null,
            record.rawData ? JSON.stringify(record.rawData) : null,
          ],
        );
      }
      imported++;
    }

    // Reset consecutive failures and update last_sync_at
    await conn.execute(
      `UPDATE wearable_connections
       SET last_sync_at = NOW(), consecutive_failures = 0
       WHERE user_id = ? AND provider = ?`,
      [userId, provider],
    );
  });

  return imported;
}

/**
 * Record a sync failure for a provider.
 * Increments consecutive_failures counter.
 * Returns true if the user should be notified (≥ 3 consecutive failures).
 *
 * Requirements: 10.5
 */
export async function recordSyncFailure(
  userId: string,
  provider: WearableProvider,
): Promise<{ consecutiveFailures: number; shouldNotify: boolean }> {
  await query(
    `UPDATE wearable_connections
     SET consecutive_failures = consecutive_failures + 1
     WHERE user_id = ? AND provider = ?`,
    [userId, provider],
  );

  const rows = await query<{ consecutive_failures: number }>(
    'SELECT consecutive_failures FROM wearable_connections WHERE user_id = ? AND provider = ? LIMIT 1',
    [userId, provider],
  );

  const consecutiveFailures = rows[0]?.consecutive_failures ?? 0;
  const shouldNotify = consecutiveFailures >= 3;

  return { consecutiveFailures, shouldNotify };
}

/**
 * Get imported wearable data for a user, optionally filtered by provider.
 *
 * Requirements: 10.2
 */
export async function getWearableData(
  userId: string,
  provider?: WearableProvider,
): Promise<WearableDataRow[]> {
  if (provider) {
    return query<WearableDataRow>(
      `SELECT * FROM wearable_data
       WHERE user_id = ? AND provider = ?
       ORDER BY data_date DESC
       LIMIT 90`,
      [userId, provider],
    );
  }

  return query<WearableDataRow>(
    `SELECT * FROM wearable_data
     WHERE user_id = ?
     ORDER BY data_date DESC
     LIMIT 90`,
    [userId],
  );
}
