/**
 * Repositorio de plan de entrenamiento, sesiones y series en SQLite local.
 *
 * Requirements: 12.1, 5.6, 5.7
 */

import { v4 as uuidv4 } from 'uuid';

import { dbQuery, dbRun, dbTransaction } from '../database.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalWorkoutPlan {
  id: string;
  userId: string;
  planType: string;
  isActive: number;
  generatedAt: number | null;
  config: string | null;
  syncedAt: number;
}

export interface LocalWorkoutDay {
  id: string;
  planId: string;
  dayOfWeek: number;
  focus: string;
}

export interface LocalPlanExercise {
  id: string;
  dayId: string;
  exerciseId: string;
  exerciseName: string | null;
  muscleGroups: string | null;
  equipmentType: string | null;
  gifUrl: string | null;
  sets: number;
  repsTarget: number;
  restSeconds: number;
  orderIndex: number;
  supersetGroupId: string | null;
  weightKg: number;
  isCompound: number;
}

export interface LocalSession {
  id: string;
  userId: string;
  planId: string | null;
  startedAt: number;
  completedAt: number | null;
  totalVolumeKg: number | null;
  durationSeconds: number | null;
  isActive: number;
  offlineState: string | null;
  isSynced: number;
}

export interface LocalSerieLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  repsDone: number;
  loggedAt: number;
  isPr: number;
  isSynced: number;
}

// ── Workout plan cache ────────────────────────────────────────────────────────

export async function cacheWorkoutPlan(
  plan: Omit<LocalWorkoutPlan, 'syncedAt'>,
  days: LocalWorkoutDay[],
  exercises: LocalPlanExercise[],
): Promise<void> {
  const ops = [
    // Desactivar planes anteriores
    {
      sql: 'UPDATE workout_plan_cache SET is_active = 0 WHERE user_id = ?',
      params: [plan.userId] as (string | number | null)[],
    },
    // Insertar nuevo plan
    {
      sql: `INSERT INTO workout_plan_cache (id, user_id, plan_type, is_active, generated_at, config, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              plan_type = excluded.plan_type,
              is_active = excluded.is_active,
              generated_at = excluded.generated_at,
              config = excluded.config,
              synced_at = excluded.synced_at`,
      params: [
        plan.id,
        plan.userId,
        plan.planType,
        plan.isActive,
        plan.generatedAt,
        plan.config,
        Date.now(),
      ] as (string | number | null)[],
    },
    // Insertar días
    ...days.map((day) => ({
      sql: `INSERT INTO workout_days_cache (id, plan_id, day_of_week, focus)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET focus = excluded.focus`,
      params: [day.id, day.planId, day.dayOfWeek, day.focus] as (string | number | null)[],
    })),
    // Insertar ejercicios
    ...exercises.map((ex) => ({
      sql: `INSERT INTO plan_exercises_cache
              (id, day_id, exercise_id, exercise_name, muscle_groups, equipment_type,
               gif_url, sets, reps_target, rest_seconds, order_index,
               superset_group_id, weight_kg, is_compound)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              weight_kg = excluded.weight_kg,
              sets = excluded.sets,
              reps_target = excluded.reps_target`,
      params: [
        ex.id,
        ex.dayId,
        ex.exerciseId,
        ex.exerciseName,
        ex.muscleGroups,
        ex.equipmentType,
        ex.gifUrl,
        ex.sets,
        ex.repsTarget,
        ex.restSeconds,
        ex.orderIndex,
        ex.supersetGroupId,
        ex.weightKg,
        ex.isCompound,
      ] as (string | number | null)[],
    })),
  ];

  await dbTransaction(ops);
}

export async function getActivePlan(userId: string): Promise<{
  plan: LocalWorkoutPlan;
  days: Array<LocalWorkoutDay & { exercises: LocalPlanExercise[] }>;
} | null> {
  const plans = await dbQuery<LocalWorkoutPlan>(
    'SELECT * FROM workout_plan_cache WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  );

  if (plans.length === 0) return null;

  const plan = plans[0]!;
  const days = await dbQuery<LocalWorkoutDay>(
    'SELECT * FROM workout_days_cache WHERE plan_id = ? ORDER BY day_of_week',
    [plan.id],
  );

  const daysWithExercises = await Promise.all(
    days.map(async (day) => {
      const exercises = await dbQuery<LocalPlanExercise>(
        'SELECT * FROM plan_exercises_cache WHERE day_id = ? ORDER BY order_index',
        [day.id],
      );
      return { ...day, exercises };
    }),
  );

  return { plan, days: daysWithExercises };
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function createLocalSession(
  userId: string,
  planId: string | null,
): Promise<LocalSession> {
  const id = uuidv4();
  const startedAt = Date.now();

  await dbRun(
    `INSERT INTO sessions_local (id, user_id, plan_id, started_at, is_active, is_synced)
     VALUES (?, ?, ?, ?, 1, 0)`,
    [id, userId, planId],
  );

  const rows = await dbQuery<LocalSession>(
    'SELECT * FROM sessions_local WHERE id = ?',
    [id],
  );

  return rows[0]!;
}

export async function updateLocalSession(
  sessionId: string,
  data: Partial<Pick<LocalSession, 'offlineState' | 'isActive' | 'completedAt' | 'totalVolumeKg' | 'durationSeconds'>>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.offlineState !== undefined) {
    sets.push('offline_state = ?');
    params.push(data.offlineState);
  }
  if (data.isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(data.isActive);
  }
  if (data.completedAt !== undefined) {
    sets.push('completed_at = ?');
    params.push(data.completedAt);
  }
  if (data.totalVolumeKg !== undefined) {
    sets.push('total_volume_kg = ?');
    params.push(data.totalVolumeKg);
  }
  if (data.durationSeconds !== undefined) {
    sets.push('duration_seconds = ?');
    params.push(data.durationSeconds);
  }

  if (sets.length === 0) return;

  params.push(sessionId);
  await dbRun(
    `UPDATE sessions_local SET ${sets.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function getActiveSession(userId: string): Promise<LocalSession | null> {
  const rows = await dbQuery<LocalSession>(
    'SELECT * FROM sessions_local WHERE user_id = ? AND is_active = 1 ORDER BY started_at DESC LIMIT 1',
    [userId],
  );
  return rows[0] ?? null;
}

export async function getUnsyncedSessions(userId: string): Promise<LocalSession[]> {
  return dbQuery<LocalSession>(
    'SELECT * FROM sessions_local WHERE user_id = ? AND is_synced = 0 ORDER BY started_at',
    [userId],
  );
}

// ── Serie logs ────────────────────────────────────────────────────────────────

export async function createLocalSerieLog(
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  weightKg: number,
  repsDone: number,
): Promise<LocalSerieLog> {
  const id = uuidv4();
  const loggedAt = Date.now();

  await dbRun(
    `INSERT INTO serie_logs_local (id, session_id, exercise_id, set_number, weight_kg, reps_done, logged_at, is_pr, is_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    [id, sessionId, exerciseId, setNumber, weightKg, repsDone, loggedAt],
  );

  const rows = await dbQuery<LocalSerieLog>(
    'SELECT * FROM serie_logs_local WHERE id = ?',
    [id],
  );

  return rows[0]!;
}

export async function getSerieLogsForSession(sessionId: string): Promise<LocalSerieLog[]> {
  return dbQuery<LocalSerieLog>(
    'SELECT * FROM serie_logs_local WHERE session_id = ? ORDER BY logged_at',
    [sessionId],
  );
}

export async function getUnsyncedSerieLogs(userId: string): Promise<LocalSerieLog[]> {
  return dbQuery<LocalSerieLog>(
    `SELECT sl.* FROM serie_logs_local sl
     JOIN sessions_local s ON sl.session_id = s.id
     WHERE s.user_id = ? AND sl.is_synced = 0
     ORDER BY sl.logged_at`,
    [userId],
  );
}
