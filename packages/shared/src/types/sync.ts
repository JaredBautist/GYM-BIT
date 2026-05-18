/**
 * Offline queue and sync types.
 */

export type OfflineOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export type OfflineEntityType =
  | 'session'
  | 'serie_log'
  | 'food_log'
  | 'sleep_record'
  | 'weight';

export interface OfflineQueueItem {
  id: string;                          // UUID local
  userId: string;
  operation: OfflineOperation;
  entityType: OfflineEntityType;
  entityId: string;
  payload: Record<string, unknown>;
  clientTimestamp: number;             // Unix ms — used for "last write wins"
  isProcessed: boolean;
}

export interface NotificationSetting {
  id: string;
  userId: string;
  notificationType: string;
  isEnabled: boolean;
  scheduledTime?: string; // HH:MM
  config?: Record<string, unknown>;
}
