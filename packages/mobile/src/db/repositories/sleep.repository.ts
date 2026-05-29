/**
 * Repositorio de sueño en SQLite local.
 *
 * Requirements: 12.1, 8.1
 */

import { v4 as uuidv4 } from 'uuid';

import { dbQuery, dbRun } from '../database';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalSleepRecord {
  id: string;
  userId: string;
  sleepStart: number;
  sleepEnd: number;
  durationMinutes: number;
  qualityStars: number;
  phases: string | null;
  source: string;
  recordedAt: number;
  isSynced: number;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createLocalSleepRecord(
  userId: string,
  sleepStart: number,
  sleepEnd: number,
  durationMinutes: number,
  qualityStars: number,
  phases: string | null = null,
  source: 'MANUAL' | 'WEARABLE' = 'MANUAL',
): Promise<LocalSleepRecord> {
  const id = uuidv4();
  const recordedAt = Date.now();

  await dbRun(
    `INSERT INTO sleep_records_local
       (id, user_id, sleep_start, sleep_end, duration_minutes, quality_stars, phases, source, recorded_at, is_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, userId, sleepStart, sleepEnd, durationMinutes, qualityStars, phases, source, recordedAt],
  );

  const rows = await dbQuery<LocalSleepRecord>(
    'SELECT * FROM sleep_records_local WHERE id = ?',
    [id],
  );

  return rows[0]!;
}

export async function getSleepHistory(userId: string, limit = 90): Promise<LocalSleepRecord[]> {
  return dbQuery<LocalSleepRecord>(
    'SELECT * FROM sleep_records_local WHERE user_id = ? ORDER BY sleep_start DESC LIMIT ?',
    [userId, limit],
  );
}

export async function getLatestSleepRecord(userId: string): Promise<LocalSleepRecord | null> {
  const rows = await dbQuery<LocalSleepRecord>(
    'SELECT * FROM sleep_records_local WHERE user_id = ? ORDER BY sleep_start DESC LIMIT 1',
    [userId],
  );
  return rows[0] ?? null;
}

export async function getUnsyncedSleepRecords(userId: string): Promise<LocalSleepRecord[]> {
  return dbQuery<LocalSleepRecord>(
    'SELECT * FROM sleep_records_local WHERE user_id = ? AND is_synced = 0 ORDER BY sleep_start',
    [userId],
  );
}
