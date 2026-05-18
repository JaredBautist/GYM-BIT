/**
 * Wearable connection and data types.
 */

export type WearableProvider = 'APPLE_WATCH' | 'GARMIN' | 'WEAR_OS';

export interface WearableConnection {
  id: string;
  userId: string;
  provider: WearableProvider;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  tokenExpiresAt: Date;
  lastSyncAt?: Date;
  isActive: boolean;
}

export interface WearableData {
  id: string;
  userId: string;
  provider: WearableProvider;
  dataDate: Date;
  steps?: number;
  caloriesBurned?: number;
  avgHeartRate?: number;
  vo2max?: number;
  stressLevel?: number;
  rawData?: Record<string, unknown>;
}
