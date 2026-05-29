/**
 * Sleep_Service — registro y análisis del ciclo de sueño.
 *
 * Responsabilidades:
 *  - Registro manual de sueño (inicio, fin, duración calculada, calidad 1–5 estrellas)
 *  - Importación de datos de fases desde wearable (REM, profundo, ligero)
 *  - Historial y último registro de sueño
 *  - Lógica de reducción de intensidad: calidad ≤ 2 estrellas → reducir 20% la carga del día
 *
 * Requirements: 8.1, 8.2, 8.3
 */

import { v4 as uuidv4 } from 'uuid';

import { query, withTransaction } from '../db/pool.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type SleepSource = 'MANUAL' | 'WEARABLE';

export interface SleepPhases {
  remMinutes?: number | undefined;
  deepMinutes?: number | undefined;
  lightMinutes?: number | undefined;
}

export interface SleepRecordRow {
  id: string;
  user_id: string;
  sleep_start: Date;
  sleep_end: Date;
  duration_minutes: number;
  quality_stars: number;
  phases: string | SleepPhases | null;
  source: SleepSource;
  recorded_at: Date;
}

export interface CreateSleepInput {
  sleepStart: Date | string;
  sleepEnd: Date | string;
  qualityStars: number;
}

export interface ImportWearableSleepInput {
  sleepStart: Date | string;
  sleepEnd: Date | string;
  qualityStars: number;
  phases?: SleepPhases | undefined;
}

// ── Pure calculation functions (exported for testing) ─────────────────────────

/**
 * Calculate sleep duration in minutes between two timestamps.
 *
 * Requirements: 8.1
 */
export function calculateDurationMinutes(
  sleepStart: Date | string,
  sleepEnd: Date | string,
): number {
  const start = new Date(sleepStart).getTime();
  const end = new Date(sleepEnd).getTime();
  const diffMs = end - start;
  return Math.max(0, Math.round(diffMs / 60_000));
}

/**
 * Determine whether the workout intensity should be reduced based on sleep quality.
 * Returns true if quality_stars ≤ 2 (triggers 20% intensity reduction).
 *
 * Requirements: 8.3
 */
export function shouldReduceIntensity(qualityStars: number): boolean {
  return qualityStars <= 2;
}

/**
 * Calculate the reduced weight for a plan exercise when sleep quality is poor.
 * Reduces the weight by 20% (rounded to 1 decimal).
 *
 * Requirements: 8.3
 */
export function applyIntensityReduction(weightKg: number): number {
  return Math.round(weightKg * 0.8 * 10) / 10;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Register a manual sleep entry for the user.
 * Calculates duration from start/end timestamps.
 * Stores quality rating on a 1–5 star scale.
 *
 * Requirements: 8.1
 */
export async function createSleepRecord(
  userId: string,
  input: CreateSleepInput,
): Promise<SleepRecordRow> {
  const { sleepStart, sleepEnd, qualityStars } = input;

  // Validate quality range
  if (qualityStars < 1 || qualityStars > 5 || !Number.isInteger(qualityStars)) {
    throw Object.assign(
      new Error('La calificación de calidad debe ser un entero entre 1 y 5 estrellas.'),
      { code: 'INVALID_QUALITY' },
    );
  }

  const startDate = new Date(sleepStart);
  const endDate = new Date(sleepEnd);

  if (endDate <= startDate) {
    throw Object.assign(
      new Error('La hora de fin debe ser posterior a la hora de inicio.'),
      { code: 'INVALID_SLEEP_TIMES' },
    );
  }

  const durationMinutes = calculateDurationMinutes(startDate, endDate);
  const id = uuidv4();

  await query(
    `INSERT INTO sleep_records
       (id, user_id, sleep_start, sleep_end, duration_minutes, quality_stars, phases, source, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 'MANUAL', datetime('now'))`,
    [id, userId, startDate, endDate, durationMinutes, qualityStars],
  );

  const rows = await query<SleepRecordRow>(
    'SELECT * FROM sleep_records WHERE id = ?',
    [id],
  );

  return rows[0]!;
}

/**
 * Import sleep data from a connected wearable device.
 * Includes sleep phase breakdown (REM, deep, light).
 *
 * Requirements: 8.2
 */
export async function importWearableSleep(
  userId: string,
  input: ImportWearableSleepInput,
): Promise<SleepRecordRow> {
  const { sleepStart, sleepEnd, qualityStars, phases } = input;

  if (qualityStars < 1 || qualityStars > 5 || !Number.isInteger(qualityStars)) {
    throw Object.assign(
      new Error('La calificación de calidad debe ser un entero entre 1 y 5 estrellas.'),
      { code: 'INVALID_QUALITY' },
    );
  }

  const startDate = new Date(sleepStart);
  const endDate = new Date(sleepEnd);

  if (endDate <= startDate) {
    throw Object.assign(
      new Error('La hora de fin debe ser posterior a la hora de inicio.'),
      { code: 'INVALID_SLEEP_TIMES' },
    );
  }

  const durationMinutes = calculateDurationMinutes(startDate, endDate);
  const id = uuidv4();

  await query(
    `INSERT INTO sleep_records
       (id, user_id, sleep_start, sleep_end, duration_minutes, quality_stars, phases, source, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'WEARABLE', datetime('now'))`,
    [id, userId, startDate, endDate, durationMinutes, qualityStars, phases ? JSON.stringify(phases) : null],
  );

  const rows = await query<SleepRecordRow>(
    'SELECT * FROM sleep_records WHERE id = ?',
    [id],
  );

  return rows[0]!;
}

/**
 * Fetch the sleep history for a user, ordered by sleep_start DESC.
 * Returns up to 90 records (≈ 3 months).
 *
 * Requirements: 8.1
 */
export async function getSleepHistory(userId: string): Promise<SleepRecordRow[]> {
  return query<SleepRecordRow>(
    `SELECT * FROM sleep_records
     WHERE user_id = ?
     ORDER BY sleep_start DESC
     LIMIT 90`,
    [userId],
  );
}

/**
 * Fetch the most recent sleep record for a user.
 * Returns null if no records exist.
 *
 * Requirements: 8.1, 8.3
 */
export async function getLatestSleepRecord(userId: string): Promise<SleepRecordRow | null> {
  const rows = await query<SleepRecordRow>(
    `SELECT * FROM sleep_records
     WHERE user_id = ?
     ORDER BY sleep_start DESC
     LIMIT 1`,
    [userId],
  );

  return rows[0] ?? null;
}

/**
 * Apply a 20% intensity reduction to all exercises in the user's active workout plan
 * when the latest sleep quality was ≤ 2 stars.
 *
 * Called automatically when a session is about to start (or when the daily plan is fetched).
 * Returns the number of exercises updated, or 0 if no reduction was applied.
 *
 * Requirements: 8.3
 */
export async function applyIntensityReductionIfNeeded(
  userId: string,
): Promise<{ applied: boolean; updatedExercises: number; qualityStars: number | null }> {
  // 1. Get the latest sleep record from the last 24 hours
  const rows = await query<SleepRecordRow>(
    `SELECT * FROM sleep_records
     WHERE user_id = ?
        AND sleep_start >= datetime('now', '-24 hours')
     ORDER BY sleep_start DESC
     LIMIT 1`,
    [userId],
  );

  if (rows.length === 0) {
    return { applied: false, updatedExercises: 0, qualityStars: null };
  }

  const latestSleep = rows[0]!;

  if (!shouldReduceIntensity(latestSleep.quality_stars)) {
    return { applied: false, updatedExercises: 0, qualityStars: latestSleep.quality_stars };
  }

  // 2. Get all exercises in the user's active plan
  const planExercises = await query<{ id: string; weight_kg: number }>(
    `SELECT pe.id, pe.weight_kg
     FROM plan_exercises pe
     JOIN workout_days wd ON pe.day_id = wd.id
     JOIN workout_plans wp ON wd.plan_id = wp.id
     WHERE wp.user_id = ? AND wp.is_active = TRUE AND pe.weight_kg > 0`,
    [userId],
  );

  if (planExercises.length === 0) {
    return { applied: true, updatedExercises: 0, qualityStars: latestSleep.quality_stars };
  }

  // 3. Apply 20% reduction to each exercise weight
  await withTransaction(async (conn) => {
    for (const pe of planExercises) {
      const reducedWeight = applyIntensityReduction(pe.weight_kg);
      await conn.execute(
        'UPDATE plan_exercises SET weight_kg = ? WHERE id = ?',
        [reducedWeight, pe.id],
      );
    }
  });

  return {
    applied: true,
    updatedExercises: planExercises.length,
    qualityStars: latestSleep.quality_stars,
  };
}
