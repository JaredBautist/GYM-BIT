/**
 * Cola_Offline para la versión web PWA — misma lógica que el cliente móvil.
 * Usa IndexedDB en lugar de SQLite.
 *
 * Requirements: 12.2, 12.3
 */

import { v4 as uuidv4 } from 'uuid';

import { idbPut, idbGetByIndex, idbGet, STORES } from '../db/indexeddb.js';
import type { OfflineOperation, OfflineEntityType, OfflineQueueItem } from '@gymbit/shared';

interface LocalOfflineQueueItem {
  id: string;
  user_id: string;
  operation: OfflineOperation;
  entity_type: OfflineEntityType;
  entity_id: string;
  payload: Record<string, unknown>;
  client_timestamp: number;
  is_processed: boolean;
  created_at: number;
}

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
): Promise<OfflineQueueItem> {
  const clientTimestamp = Date.now();

  const item: LocalOfflineQueueItem = {
    id: uuidv4(),
    user_id: userId,
    operation,
    entity_type: entityType,
    entity_id: entityId,
    payload,
    client_timestamp: clientTimestamp,
    is_processed: false,
    created_at: clientTimestamp,
  };

  await idbPut(STORES.OFFLINE_QUEUE, item);

  return {
    id: item.id,
    userId: item.user_id,
    operation: item.operation,
    entityType: item.entity_type,
    entityId: item.entity_id,
    payload: item.payload,
    clientTimestamp: item.client_timestamp,
    isProcessed: item.is_processed,
  };
}

/**
 * Obtiene todos los items pendientes de sincronización.
 * Ordenados por clientTimestamp ascendente.
 */
export async function getPendingItems(userId: string): Promise<OfflineQueueItem[]> {
  const all = await idbGetByIndex<LocalOfflineQueueItem>(
    STORES.OFFLINE_QUEUE,
    'user_processed',
    IDBKeyRange.only([userId, false]),
  );

  return all
    .sort((a, b) => a.client_timestamp - b.client_timestamp)
    .map((item) => ({
      id: item.id,
      userId: item.user_id,
      operation: item.operation,
      entityType: item.entity_type,
      entityId: item.entity_id,
      payload: item.payload,
      clientTimestamp: item.client_timestamp,
      isProcessed: item.is_processed,
    }));
}

/**
 * Marca un item como procesado (idempotente).
 */
export async function markItemProcessed(itemId: string): Promise<void> {
  const item = await idbGet<LocalOfflineQueueItem>(STORES.OFFLINE_QUEUE, itemId);
  if (item) {
    await idbPut(STORES.OFFLINE_QUEUE, { ...item, is_processed: true });
  }
}

/**
 * Dispara la sincronización con el servidor.
 */
export async function triggerSync(
  userId: string,
  accessToken: string,
  apiBaseUrl: string,
): Promise<{ synced: number; errors: number }> {
  const items = await getPendingItems(userId);
  if (items.length === 0) return { synced: 0, errors: 0 };

  try {
    const response = await fetch(`${apiBaseUrl}/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ items: items.slice(0, 500) }),
    });

    if (!response.ok) return { synced: 0, errors: items.length };

    const result = (await response.json()) as {
      processed: number;
      errors: Array<{ id: string }>;
    };

    const errorIds = new Set(result.errors.map((e) => e.id));
    const successIds = items.filter((i) => !errorIds.has(i.id)).map((i) => i.id);

    await Promise.all(successIds.map(markItemProcessed));

    return { synced: result.processed, errors: result.errors.length };
  } catch {
    return { synced: 0, errors: 0 };
  }
}
