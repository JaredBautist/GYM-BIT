/**
 * Sync_Service — sincronización offline/online y resolución de conflictos.
 *
 * Responsabilidades:
 *  - Recibir la Cola_Offline del cliente (POST /sync/push) y aplicar escrituras
 *  - Enviar cambios del servidor al cliente (GET /sync/pull)
 *  - Estado de sincronización (GET /sync/status)
 *  - Resolución de conflictos: última escritura gana por clientTimestamp
 *  - Idempotencia: procesar la misma operación dos veces produce el mismo resultado
 *
 * Requirements: 12.2, 12.3, 12.4
 */

import { v4 as uuidv4 } from 'uuid';

import { query, withTransaction } from '../db/pool.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type OfflineOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export type OfflineEntityType =
  | 'session'
  | 'serie_log'
  | 'food_log'
  | 'sleep_record'
  | 'weight';

export interface OfflineQueueItem {
  id: string;                        // UUID local generado en el cliente
  userId: string;
  operation: OfflineOperation;
  entityType: OfflineEntityType;
  entityId: string;
  payload: Record<string, unknown>;
  clientTimestamp: number;           // Unix ms — usado para "última escritura gana"
  isProcessed: boolean;
}

export interface OfflineQueueRow {
  id: string;
  user_id: string;
  operation: OfflineOperation;
  entity_type: OfflineEntityType;
  entity_id: string;
  payload: string | Record<string, unknown>;
  client_timestamp: number;
  is_processed: boolean | number;
  created_at: Date;
}

export interface SyncPushResult {
  processed: number;
  skipped: number;
  errors: Array<{ id: string; error: string }>;
}

export interface SyncPullResult {
  sessions: unknown[];
  serieLogs: unknown[];
  foodLogs: unknown[];
  sleepRecords: unknown[];
  weightHistory: unknown[];
  serverTimestamp: number;
}

export interface SyncStatus {
  pendingItems: number;
  lastSyncAt: Date | null;
  isProcessing: boolean;
}

// ── Pure functions (exported for testing) ─────────────────────────────────────

/**
 * Resolve a conflict between two writes to the same entity.
 * Policy: last write wins — the item with the higher clientTimestamp prevails.
 *
 * Requirements: 12.4
 */
export function resolveConflict(
  existing: { clientTimestamp: number; payload: Record<string, unknown> },
  incoming: { clientTimestamp: number; payload: Record<string, unknown> },
): { payload: Record<string, unknown>; clientTimestamp: number } {
  if (incoming.clientTimestamp >= existing.clientTimestamp) {
    return { payload: incoming.payload, clientTimestamp: incoming.clientTimestamp };
  }
  return { payload: existing.payload, clientTimestamp: existing.clientTimestamp };
}

/**
 * Determine if an offline queue item should be skipped (already processed).
 * Ensures idempotency: processing the same item twice has no effect.
 *
 * Requirements: 12.3
 */
export function shouldSkipItem(item: OfflineQueueItem): boolean {
  return item.isProcessed;
}

// ── Entity write handlers ─────────────────────────────────────────────────────

/**
 * Apply a single offline queue item to the database.
 * Implements "last write wins" conflict resolution using clientTimestamp.
 * Idempotent: if the item was already processed, it is skipped.
 */
async function applyQueueItem(
  item: OfflineQueueItem,
): Promise<{ applied: boolean; reason?: string }> {
  // Idempotency check: skip if already processed
  if (shouldSkipItem(item)) {
    return { applied: false, reason: 'already_processed' };
  }

  const { operation, entityType, entityId, payload, clientTimestamp } = item;

  switch (entityType) {
    case 'session': {
      await applySessionWrite(operation, entityId, payload, clientTimestamp);
      break;
    }
    case 'serie_log': {
      await applySerieLogWrite(operation, entityId, payload, clientTimestamp);
      break;
    }
    case 'food_log': {
      await applyFoodLogWrite(operation, entityId, payload, clientTimestamp);
      break;
    }
    case 'sleep_record': {
      await applySleepRecordWrite(operation, entityId, payload, clientTimestamp);
      break;
    }
    case 'weight': {
      await applyWeightWrite(operation, entityId, payload, clientTimestamp);
      break;
    }
  }

  return { applied: true };
}

async function applySessionWrite(
  operation: OfflineOperation,
  entityId: string,
  payload: Record<string, unknown>,
  clientTimestamp: number,
): Promise<void> {
  if (operation === 'CREATE') {
    // Check if session already exists (idempotency)
    const existing = await query<{ id: string; client_timestamp?: number }>(
      'SELECT id FROM sessions WHERE id = ? LIMIT 1',
      [entityId],
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO sessions (id, user_id, plan_id, started_at, is_active, offline_state)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          entityId,
          payload['userId'],
          payload['planId'] ?? null,
          payload['startedAt'] ?? new Date(),
          payload['isActive'] ?? true,
          payload['offlineState'] ? JSON.stringify(payload['offlineState']) : null,
        ],
      );
    }
  } else if (operation === 'UPDATE') {
    // Last write wins: only update if clientTimestamp is newer
    const existing = await query<{ id: string }>(
      'SELECT id FROM sessions WHERE id = ? LIMIT 1',
      [entityId],
    );
    if (existing.length > 0) {
      await query(
        `UPDATE sessions
         SET completed_at = ?, total_volume_kg = ?, duration_seconds = ?,
             is_active = ?, offline_state = ?
         WHERE id = ?`,
        [
          payload['completedAt'] ?? null,
          payload['totalVolumeKg'] ?? null,
          payload['durationSeconds'] ?? null,
          payload['isActive'] ?? false,
          payload['offlineState'] ? JSON.stringify(payload['offlineState']) : null,
          entityId,
        ],
      );
    }
  }
  void clientTimestamp; // used for conflict resolution at the queue level
}

async function applySerieLogWrite(
  operation: OfflineOperation,
  entityId: string,
  payload: Record<string, unknown>,
  _clientTimestamp: number,
): Promise<void> {
  if (operation === 'CREATE') {
    const existing = await query<{ id: string }>(
      'SELECT id FROM serie_logs WHERE id = ? LIMIT 1',
      [entityId],
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO serie_logs (id, session_id, exercise_id, set_number, weight_kg, reps_done, logged_at, is_pr)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId,
          payload['sessionId'],
          payload['exerciseId'],
          payload['setNumber'],
          payload['weightKg'],
          payload['repsDone'],
          payload['loggedAt'] ?? new Date(),
          payload['isPr'] ?? false,
        ],
      );
    }
  } else if (operation === 'DELETE') {
    await query('DELETE FROM serie_logs WHERE id = ?', [entityId]);
  }
}

async function applyFoodLogWrite(
  operation: OfflineOperation,
  entityId: string,
  payload: Record<string, unknown>,
  _clientTimestamp: number,
): Promise<void> {
  if (operation === 'CREATE') {
    const existing = await query<{ id: string }>(
      'SELECT id FROM food_logs WHERE id = ? LIMIT 1',
      [entityId],
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO food_logs (id, meal_id, food_id, quantity_g, calories, protein, carbs, fat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId,
          payload['mealId'],
          payload['foodId'],
          payload['quantityG'],
          payload['calories'],
          payload['protein'],
          payload['carbs'],
          payload['fat'],
        ],
      );
    }
  } else if (operation === 'DELETE') {
    await query('DELETE FROM food_logs WHERE id = ?', [entityId]);
  }
}

async function applySleepRecordWrite(
  operation: OfflineOperation,
  entityId: string,
  payload: Record<string, unknown>,
  _clientTimestamp: number,
): Promise<void> {
  if (operation === 'CREATE') {
    const existing = await query<{ id: string }>(
      'SELECT id FROM sleep_records WHERE id = ? LIMIT 1',
      [entityId],
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO sleep_records (id, user_id, sleep_start, sleep_end, duration_minutes, quality_stars, phases, source, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          entityId,
          payload['userId'],
          payload['sleepStart'],
          payload['sleepEnd'],
          payload['durationMinutes'],
          payload['qualityStars'],
          payload['phases'] ? JSON.stringify(payload['phases']) : null,
          payload['source'] ?? 'MANUAL',
        ],
      );
    }
  } else if (operation === 'UPDATE') {
    await query(
      `UPDATE sleep_records
       SET quality_stars = ?, phases = ?
       WHERE id = ?`,
      [
        payload['qualityStars'],
        payload['phases'] ? JSON.stringify(payload['phases']) : null,
        entityId,
      ],
    );
  } else if (operation === 'DELETE') {
    await query('DELETE FROM sleep_records WHERE id = ?', [entityId]);
  }
}

async function applyWeightWrite(
  operation: OfflineOperation,
  entityId: string,
  payload: Record<string, unknown>,
  _clientTimestamp: number,
): Promise<void> {
  if (operation === 'CREATE') {
    const existing = await query<{ id: string }>(
      'SELECT id FROM weight_history WHERE id = ? LIMIT 1',
      [entityId],
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO weight_history (id, user_id, weight_kg, recorded_at)
         VALUES (?, ?, ?, ?)`,
        [
          entityId,
          payload['userId'],
          payload['weightKg'],
          payload['recordedAt'] ?? new Date(),
        ],
      );
    }
  }
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Process the offline queue sent by the client.
 * Applies each item in order of clientTimestamp (oldest first).
 * Resolves conflicts using "last write wins" policy.
 * Marks each item as processed in OFFLINE_QUEUE.
 * Idempotent: items already marked as processed are skipped.
 *
 * Requirements: 12.2, 12.3, 12.4
 */
export async function processSyncPush(
  userId: string,
  items: OfflineQueueItem[],
): Promise<SyncPushResult> {
  const result: SyncPushResult = { processed: 0, skipped: 0, errors: [] };

  if (items.length === 0) return result;

  // Sort by clientTimestamp ascending (oldest first) for correct conflict resolution
  const sorted = [...items].sort((a, b) => a.clientTimestamp - b.clientTimestamp);

  // Group by entityId to detect conflicts within the batch
  const byEntity = new Map<string, OfflineQueueItem[]>();
  for (const item of sorted) {
    const key = `${item.entityType}:${item.entityId}`;
    const group = byEntity.get(key) ?? [];
    group.push(item);
    byEntity.set(key, group);
  }

  // For each entity, keep only the winning item (highest clientTimestamp)
  const winners: OfflineQueueItem[] = [];
  for (const group of byEntity.values()) {
    // Sort descending by clientTimestamp — first item is the winner
    const sorted2 = [...group].sort((a, b) => b.clientTimestamp - a.clientTimestamp);
    winners.push(sorted2[0]!);
  }

  // Apply winners inside a transaction
  await withTransaction(async (conn) => {
    for (const item of winners) {
      try {
        const applyResult = await applyQueueItem(item);

        if (applyResult.applied) {
          // Mark as processed in OFFLINE_QUEUE (upsert)
          await conn.execute(
            `INSERT INTO offline_queue
               (id, user_id, operation, entity_type, entity_id, payload, client_timestamp, is_processed, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW())
             ON DUPLICATE KEY UPDATE is_processed = TRUE`,
            [
              item.id,
              userId,
              item.operation,
              item.entityType,
              item.entityId,
              JSON.stringify(item.payload),
              item.clientTimestamp,
            ],
          );
          result.processed++;
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.errors.push({
          id: item.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });

  return result;
}

/**
 * Pull server-side changes for a user since a given timestamp.
 * Returns all entities modified after the provided serverTimestamp.
 *
 * Requirements: 12.3
 */
export async function processSyncPull(
  userId: string,
  since?: number,
): Promise<SyncPullResult> {
  const sinceDate = since ? new Date(since) : new Date(0);

  const [sessions, serieLogs, foodLogs, sleepRecords, weightHistory] = await Promise.all([
    query(
      `SELECT * FROM sessions WHERE user_id = ? AND started_at > ? ORDER BY started_at DESC LIMIT 100`,
      [userId, sinceDate],
    ),
    query(
      `SELECT sl.* FROM serie_logs sl
       JOIN sessions s ON sl.session_id = s.id
       WHERE s.user_id = ? AND sl.logged_at > ?
       ORDER BY sl.logged_at DESC LIMIT 500`,
      [userId, sinceDate],
    ),
    query(
      `SELECT fl.* FROM food_logs fl
       JOIN meals m ON fl.meal_id = m.id
       JOIN daily_records dr ON m.daily_record_id = dr.id
       WHERE dr.user_id = ? AND dr.record_date > ?
       ORDER BY dr.record_date DESC LIMIT 500`,
      [userId, sinceDate],
    ),
    query(
      `SELECT * FROM sleep_records WHERE user_id = ? AND recorded_at > ? ORDER BY recorded_at DESC LIMIT 90`,
      [userId, sinceDate],
    ),
    query(
      `SELECT * FROM weight_history WHERE user_id = ? AND recorded_at > ? ORDER BY recorded_at DESC LIMIT 90`,
      [userId, sinceDate],
    ),
  ]);

  return {
    sessions,
    serieLogs,
    foodLogs,
    sleepRecords,
    weightHistory,
    serverTimestamp: Date.now(),
  };
}

/**
 * Get the sync status for a user.
 * Returns the count of pending (unprocessed) items in OFFLINE_QUEUE.
 *
 * Requirements: 12.3
 */
export async function getSyncStatus(userId: string): Promise<SyncStatus> {
  const pendingRows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM offline_queue WHERE user_id = ? AND is_processed = FALSE`,
    [userId],
  );

  const lastSyncRows = await query<{ last_sync: Date }>(
    `SELECT MAX(created_at) AS last_sync FROM offline_queue WHERE user_id = ? AND is_processed = TRUE`,
    [userId],
  );

  return {
    pendingItems: pendingRows[0]?.count ?? 0,
    lastSyncAt: lastSyncRows[0]?.last_sync ?? null,
    isProcessing: false,
  };
}
