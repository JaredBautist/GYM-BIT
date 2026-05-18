/**
 * Sleep record types.
 */

export type SleepSource = 'MANUAL' | 'APPLE_WATCH' | 'GARMIN' | 'WEAR_OS';

export interface SleepRecord {
  id: string;
  userId: string;
  sleepStart: Date;
  sleepEnd: Date;
  durationMinutes: number;
  qualityStars: number; // 1–5
  phases?: SleepPhases;
  source: SleepSource;
  recordedAt: Date;
}

export interface SleepPhases {
  remMinutes: number;
  deepMinutes: number;
  lightMinutes: number;
}
