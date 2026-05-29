/**
 * SyncManager — detecta recuperación de conexión y dispara POST /sync/push.
 *
 * Responsabilidades:
 *  - Interceptar escrituras offline y encolarlas con clientTimestamp
 *  - Detectar recuperación de conexión (NetInfo)
 *  - Disparar POST /sync/push automáticamente al recuperar conexión
 *  - Marcar items como procesados tras sincronización exitosa
 *
 * Requirements: 12.2, 12.3
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import {
  enqueueOfflineWrite,
  getPendingItems,
  markItemsProcessed,
  getPendingCount,
} from './queue';
import { getSession } from '../db/repositories/user.repository';
import type { OfflineOperation, OfflineEntityType } from '@gymbit/shared';

// ── Config ────────────────────────────────────────────────────────────────────

const SYNC_ENDPOINT = '/sync/push';
const MAX_BATCH_SIZE = 500;

// ── State ─────────────────────────────────────────────────────────────────────

let _unsubscribeNetInfo: (() => void) | null = null;
let _isSyncing = false;
let _apiBaseUrl = '';

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Inicializa el SyncManager con la URL base de la API.
 * Suscribe al listener de conectividad para disparar sync automático.
 *
 * Requirements: 12.3
 */
export function initSyncManager(apiBaseUrl: string): void {
  _apiBaseUrl = apiBaseUrl;

  // Desuscribir listener anterior si existe
  if (_unsubscribeNetInfo) {
    _unsubscribeNetInfo();
  }

  // Suscribir al cambio de estado de red
  _unsubscribeNetInfo = NetInfo.addEventListener(handleNetworkChange);
}

/**
 * Detiene el SyncManager (útil en tests y cleanup).
 */
export function destroySyncManager(): void {
  if (_unsubscribeNetInfo) {
    _unsubscribeNetInfo();
    _unsubscribeNetInfo = null;
  }
  _isSyncing = false;
}

// ── Network change handler ────────────────────────────────────────────────────

async function handleNetworkChange(state: NetInfoState): Promise<void> {
  // Solo disparar sync cuando se recupera la conexión
  if (state.isConnected && state.isInternetReachable) {
    await triggerSync();
  }
}

// ── Write interceptor ─────────────────────────────────────────────────────────

/**
 * Intercepta una escritura y la encola en la Cola_Offline con clientTimestamp.
 * Toda escritura offline queda encolada ANTES de intentar sincronizar.
 *
 * Requirements: 12.2
 */
export async function writeOffline(
  userId: string,
  operation: OfflineOperation,
  entityType: OfflineEntityType,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Encolar siempre con clientTimestamp (incluso si hay conexión,
  // para garantizar que no se pierdan datos)
  await enqueueOfflineWrite(userId, operation, entityType, entityId, payload);
}

// ── Sync trigger ──────────────────────────────────────────────────────────────

/**
 * Dispara la sincronización de la Cola_Offline con el servidor.
 * Idempotente: si ya está sincronizando, no hace nada.
 *
 * Requirements: 12.3
 */
export async function triggerSync(): Promise<{
  synced: number;
  errors: number;
}> {
  if (_isSyncing) return { synced: 0, errors: 0 };

  const session = await getSession();
  if (!session) return { synced: 0, errors: 0 };

  const pendingCount = await getPendingCount(session.userId);
  if (pendingCount === 0) return { synced: 0, errors: 0 };

  _isSyncing = true;

  try {
    const items = await getPendingItems(session.userId);
    const batch = items.slice(0, MAX_BATCH_SIZE);

    const response = await fetch(`${_apiBaseUrl}${SYNC_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ items: batch }),
    });

    if (!response.ok) {
      console.error(`[SyncManager] sync/push failed: ${response.status}`);
      return { synced: 0, errors: batch.length };
    }

    const result = (await response.json()) as {
      processed: number;
      skipped: number;
      errors: Array<{ id: string; error: string }>;
    };

    // Marcar como procesados los items que no tuvieron error
    const errorIds = new Set(result.errors.map((e) => e.id));
    const successIds = batch
      .filter((item) => !errorIds.has(item.id))
      .map((item) => item.id);

    await markItemsProcessed(successIds);

    return {
      synced: result.processed,
      errors: result.errors.length,
    };
  } catch (err) {
    console.error('[SyncManager] sync error:', err);
    return { synced: 0, errors: 0 };
  } finally {
    _isSyncing = false;
  }
}

/**
 * Verifica si hay items pendientes de sincronización.
 */
export async function hasPendingSync(userId: string): Promise<boolean> {
  const count = await getPendingCount(userId);
  return count > 0;
}
