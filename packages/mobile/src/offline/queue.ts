/**
 * Cola_Offline — gestión de escrituras pendientes de sincronización.
 *
 * Responsabilidades:
 *  - Encolar escrituras cuando no hay conexión (con clientTimestamp)
 *  - Leer items pendientes para sincronizar
 *  - Marcar items como procesados
 *  - Detectar recuperación de conexión y disparar sincronización
 *
 * Requirements: 12.2, 12.3
 */

import { v4 as uuidv4 } from 'uuid';

import { dbQuery, dbRun } from '../db/database.js';
import type { OfflineOperation, OfflineEntityType, OfflineQueueItem } from '@gymbit/shared';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalOfflineQueueItem {
  id: string;
  userId: string;
  operation: OfflineOperation;
  entityType: OfflineEntityType;
  entityId: string;
  payload: string;           // JSON serializado
  clientTimestamp: number;   // Unix ms — "última escritura gana"
  isProcessed: number;       // 0 = pendiente, 1 = procesado
  createdAt: number;
}

// ── Enqueue ───────────────────────────────────────────────────────────────────

/**
 * Encola una escritura offline con clientTimestamp.
 * Toda escritura offline queda encolada ANTES de intentar sincronizar.
 *
 * Requirements: 12.2
 */
export async function enqueueOfflineWrite(
  userId: string,
  operation: OfflineOperation,
  entityType: OfflineEntityType,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<LocalOfflineQueueItem> {
  const id = uuidv4();
  const clientTimestamp = Date.now(); // Unix ms — usado para "última escritura gana"
  const createdAt = clientTimestamp;

  await dbRun(
    `INSERT INTO offline_queue
       (id, user_id, operation, entity_type, entity_id, payload, client_timestamp, is_processed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      userId,
      operation,
      entityType,
      entityId,
      JSON.stringify(payload),
      clientTimestamp,
      createdAt,
    ],
  );

  const rows = await dbQuery<LocalOfflineQueueItem>(
    'SELECT * FROM offline_queue WHERE id = ?',
    [id],
  );

  return rows[0]!;
}

// ── Read pending ──────────────────────────────────────────────────────────────

/**
 * Obtiene todos los items pendientes de sincronización para un usuario.
 * Ordenados por clientTimestamp ascendente (más antiguos primero).
 *
 * Requirements: 12.2, 12.3
 */
export async function getPendingItems(userId: string): Promise<OfflineQueueItem[]> {
  const rows = await dbQuery<LocalOfflineQueueItem>(
    `SELECT * FROM offline_queue
     WHERE user_id = ? AND is_processed = 0
     ORDER BY client_timestamp ASC`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    operation: row.operation as OfflineOperation,
    entityType: row.entityType as OfflineEntityType,
    entityId: row.entityId,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    clientTimestamp: row.clientTimestamp,
    isProcessed: row.isProcessed === 1,
  }));
}

/**
 * Cuenta los items pendientes de sincronización.
 */
export async function getPendingCount(userId: string): Promise<number> {
  const rows = await dbQuery<{ count: number }>(
    'SELECT COUNT(*) AS count FROM offline_queue WHERE user_id = ? AND is_processed = 0',
    [userId],
  );
  return rows[0]?.count ?? 0;
}

// ── Mark processed ────────────────────────────────────────────────────────────

/**
 * Marca un item como procesado (idempotente).
 *
 * Requirements: 12.3
 */
export async function markItemProcessed(itemId: string): Promise<void> {
  await dbRun(
    'UPDATE offline_queue SET is_processed = 1 WHERE id = ?',
    [itemId],
  );
}

/**
 * Marca múltiples items como procesados en una sola operación.
 */
export async function markItemsProcessed(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;

  const placeholders = itemIds.map(() => '?').join(', ');
  await dbRun(
    `UPDATE offline_queue SET is_processed = 1 WHERE id IN (${placeholders})`,
    itemIds,
  );
}

// ── Clear processed ───────────────────────────────────────────────────────────

/**
 * Elimina los items ya procesados para liberar espacio.
 * Se recomienda llamar periódicamente.
 */
export async function clearProcessedItems(userId: string): Promise<void> {
  await dbRun(
    'DELETE FROM offline_queue WHERE user_id = ? AND is_processed = 1',
    [userId],
  );
}
