/**
 * Workout_Engine — generación de rutinas, catálogo de ejercicios, plan activo,
 * sesiones de entrenamiento, serie logs y personal records.
 *
 * Responsabilidades:
 *  - Catálogo de ejercicios con filtros (EXERCISES)
 *  - Selección del tipo de rutina según objetivo, nivel y días disponibles
 *  - Generación de planes de entrenamiento (WORKOUT_PLANS + WORKOUT_DAYS + PLAN_EXERCISES)
 *  - Obtención del plan activo con días y ejercicios
 *  - Gestión de sesiones de entrenamiento (SESSIONS)
 *  - Registro de series (SERIE_LOGS) con detección de PRs (PERSONAL_RECORDS)
 *  - Sobrecarga progresiva: incremento de carga al iniciar sesión (PLAN_EXERCISES)
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.3, 5.4, 5.5
 */

import { v4 as uuidv4 } from 'uuid';

import { query, withTransaction } from '../db/pool.js';
import type { Goal, ExperienceLevel } from './profile.service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type PlanType = 'FULL_BODY' | 'PPL' | 'UPPER_LOWER' | 'CARDIO';

export interface ExerciseRow {
  id: string;
  name: string;
  muscle_groups: string | string[];
  equipment_type: string;
  category: string;
  gif_url: string | null;
  video_url: string | null;
  is_compound: boolean | number;
}

export interface WorkoutPlanRow {
  id: string;
  user_id: string;
  plan_type: string;
  is_active: boolean | number;
  generated_at: Date;
  config: string | Record<string, unknown>;
}

export interface WorkoutDayRow {
  id: string;
  plan_id: string;
  day_of_week: number;
  focus: string;
}

export interface PlanExerciseRow {
  id: string;
  day_id: string;
  exercise_id: string;
  sets: number;
  reps_target: number;
  rest_seconds: number;
  order_index: number;
  superset_group_id: string | null;
  weight_kg: number;
}

export interface WorkoutDayWithExercises extends WorkoutDayRow {
  exercises: PlanExerciseRow[];
}

export interface ActivePlan extends WorkoutPlanRow {
  days: WorkoutDayWithExercises[];
}

export interface GenerateWorkoutInput {
  goal: Goal;
  experienceLevel: ExperienceLevel;
  availableDays: number;
  equipment?: string[];
}

export interface ExerciseFilters {
  muscleGroup?: string;
  equipment?: string;
}

// ── Routine type selection (pure function, exported for testing) ──────────────

/**
 * Selects the appropriate routine type based on the user's goal,
 * experience level, and available training days.
 *
 * Logic (design.md section 3.3):
 *   objetivo = ENDURANCE          → CARDIO (overrides everything)
 *   nivel    = BEGINNER           → FULL_BODY (overrides days)
 *   días = 1-2                    → FULL_BODY
 *   días = 3                      → FULL_BODY or UPPER_LOWER → FULL_BODY (deterministic)
 *   días = 4-5                    → PPL or UPPER_LOWER → UPPER_LOWER (deterministic)
 *   días = 6+                     → PPL
 *
 * Requirements: 4.1
 */
export function selectRoutineType(
  goal: Goal,
  experienceLevel: ExperienceLevel,
  availableDays: number,
): PlanType {
  // ENDURANCE always maps to Cardio regardless of other factors
  if (goal === 'ENDURANCE') {
    return 'CARDIO';
  }

  // Beginners always get Full Body regardless of days
  if (experienceLevel === 'BEGINNER') {
    return 'FULL_BODY';
  }

  // Days-based selection for INTERMEDIATE / ADVANCED
  if (availableDays <= 2) {
    return 'FULL_BODY';
  }

  if (availableDays === 3) {
    // "Full Body o Upper/Lower" — we pick FULL_BODY as the deterministic choice
    return 'FULL_BODY';
  }

  if (availableDays <= 5) {
    // "PPL o Upper/Lower" — we pick UPPER_LOWER as the deterministic choice
    return 'UPPER_LOWER';
  }

  // 6+ days → PPL
  return 'PPL';
}

// ── Day focus maps per plan type ──────────────────────────────────────────────

/**
 * Returns the day focus labels for a given plan type and number of available days.
 * Each entry is { day_of_week (1=Mon…7=Sun), focus }.
 */
function buildDaySchedule(
  planType: PlanType,
  availableDays: number,
): Array<{ day_of_week: number; focus: string }> {
  switch (planType) {
    case 'CARDIO': {
      // Distribute cardio sessions evenly across the week
      const days: Array<{ day_of_week: number; focus: string }> = [];
      const slots = Math.min(availableDays, 7);
      for (let i = 0; i < slots; i++) {
        days.push({ day_of_week: i + 1, focus: 'Cardio' });
      }
      return days;
    }

    case 'FULL_BODY': {
      const days: Array<{ day_of_week: number; focus: string }> = [];
      const slots = Math.min(availableDays, 7);
      for (let i = 0; i < slots; i++) {
        days.push({ day_of_week: i + 1, focus: 'Full Body' });
      }
      return days;
    }

    case 'UPPER_LOWER': {
      // Alternating Upper / Lower days
      const labels = ['Upper Body', 'Lower Body'];
      const days: Array<{ day_of_week: number; focus: string }> = [];
      const slots = Math.min(availableDays, 7);
      for (let i = 0; i < slots; i++) {
        days.push({ day_of_week: i + 1, focus: labels[i % 2]! });
      }
      return days;
    }

    case 'PPL': {
      // Push / Pull / Legs cycling
      const labels = ['Push', 'Pull', 'Legs'];
      const days: Array<{ day_of_week: number; focus: string }> = [];
      const slots = Math.min(availableDays, 7);
      for (let i = 0; i < slots; i++) {
        days.push({ day_of_week: i + 1, focus: labels[i % 3]! });
      }
      return days;
    }
  }
}

// ── Exercise selection helpers ────────────────────────────────────────────────

/**
 * Returns a small set of exercises appropriate for a given day focus and
 * optional equipment filter. Exercises are fetched from the DB.
 *
 * Requirements: 4.2, 4.6, 4.7
 */
async function selectExercisesForDay(
  focus: string,
  equipment?: string[],
): Promise<ExerciseRow[]> {
  // Build a muscle-group keyword from the focus label
  const focusKeyword = focus.toLowerCase().replace(' body', '');

  let sql: string;
  let params: unknown[];

  if (equipment && equipment.length > 0) {
    // Filter by equipment (Requirement 4.6)
    const placeholders = equipment.map(() => '?').join(', ');
    sql = `
      SELECT * FROM EXERCISES
      WHERE (
        LOWER(JSON_UNQUOTE(JSON_EXTRACT(muscle_groups, '$[0]'))) LIKE ?
        OR LOWER(category) LIKE ?
        OR ? = 'full body'
        OR ? = 'cardio'
      )
      AND LOWER(equipment_type) IN (${placeholders})
      ORDER BY RAND()
      LIMIT 6
    `;
    params = [`%${focusKeyword}%`, `%${focusKeyword}%`, focusKeyword, focusKeyword, ...equipment.map((e) => e.toLowerCase())];
  } else {
    sql = `
      SELECT * FROM EXERCISES
      WHERE (
        LOWER(JSON_UNQUOTE(JSON_EXTRACT(muscle_groups, '$[0]'))) LIKE ?
        OR LOWER(category) LIKE ?
        OR ? = 'full body'
        OR ? = 'cardio'
      )
      ORDER BY RAND()
      LIMIT 6
    `;
    params = [`%${focusKeyword}%`, `%${focusKeyword}%`, focusKeyword, focusKeyword];
  }

  const rows = await query<ExerciseRow>(sql, params);

  // Fallback: if no exercises matched, return bodyweight exercises (Requirement 4.7)
  if (rows.length === 0) {
    const fallback = await query<ExerciseRow>(
      `SELECT * FROM EXERCISES
       WHERE LOWER(equipment_type) = 'bodyweight'
       ORDER BY RAND()
       LIMIT 6`,
    );
    return fallback;
  }

  return rows;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Fetch exercises from the catalogue with optional filters.
 *
 * Requirements: 4.2, 4.6
 */
export async function getExercises(filters?: ExerciseFilters): Promise<ExerciseRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.muscleGroup) {
    conditions.push(
      `JSON_SEARCH(LOWER(muscle_groups), 'one', ?) IS NOT NULL`,
    );
    params.push(`%${filters.muscleGroup.toLowerCase()}%`);
  }

  if (filters?.equipment) {
    conditions.push(`LOWER(equipment_type) = ?`);
    params.push(filters.equipment.toLowerCase());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM EXERCISES ${where} ORDER BY name`;

  return query<ExerciseRow>(sql, params);
}

/**
 * Generate a new workout plan for the user.
 *
 * Steps:
 *  1. Select routine type based on goal, experience level and available days.
 *  2. Deactivate any existing active plan.
 *  3. Insert WORKOUT_PLANS row.
 *  4. Insert WORKOUT_DAYS rows.
 *  5. For each day, select exercises and insert PLAN_EXERCISES rows.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.6, 4.7
 */
export async function generateWorkoutPlan(
  userId: string,
  input: GenerateWorkoutInput,
): Promise<ActivePlan> {
  const { goal, experienceLevel, availableDays, equipment } = input;

  const planType = selectRoutineType(goal, experienceLevel, availableDays);
  const daySchedule = buildDaySchedule(planType, availableDays);

  const planId = uuidv4();

  await withTransaction(async (conn) => {
    // 1. Deactivate previous active plan
    await conn.execute(
      `UPDATE WORKOUT_PLANS SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE`,
      [userId],
    );

    // 2. Insert new plan
    await conn.execute(
      `INSERT INTO WORKOUT_PLANS (id, user_id, plan_type, is_active, generated_at, config)
       VALUES (?, ?, ?, TRUE, NOW(), ?)`,
      [
        planId,
        userId,
        planType,
        JSON.stringify({ goal, experienceLevel, availableDays, equipment: equipment ?? [] }),
      ],
    );

    // 3. Insert days and exercises
    for (const day of daySchedule) {
      const dayId = uuidv4();

      await conn.execute(
        `INSERT INTO WORKOUT_DAYS (id, plan_id, day_of_week, focus)
         VALUES (?, ?, ?, ?)`,
        [dayId, planId, day.day_of_week, day.focus],
      );

      // Select exercises for this day
      const exercises = await selectExercisesForDay(day.focus, equipment);

      // Insert PLAN_EXERCISES — default sets/reps/rest based on plan type
      const defaultSets = planType === 'CARDIO' ? 1 : 3;
      const defaultReps = planType === 'CARDIO' ? 1 : 10;
      const defaultRest = planType === 'CARDIO' ? 60 : 90;

      for (let i = 0; i < exercises.length; i++) {
        const exercise = exercises[i]!;
        await conn.execute(
          `INSERT INTO PLAN_EXERCISES
             (id, day_id, exercise_id, sets, reps_target, rest_seconds, order_index, superset_group_id, weight_kg)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
          [uuidv4(), dayId, exercise.id, defaultSets, defaultReps, defaultRest, i],
        );
      }
    }
  });

  // Return the newly created active plan
  const plan = await getActivePlan(userId);
  if (!plan) {
    throw new Error('Failed to retrieve plan after generation');
  }
  return plan;
}

// ── Progressive overload ──────────────────────────────────────────────────────

/**
 * Returns the weight increment (in kg) to apply for progressive overload.
 *
 * - Compound exercises (is_compound = true):  +5.0 kg
 * - Isolation exercises (is_compound = false): +2.5 kg
 *
 * Requirements: 4.4
 */
export function calculateWeightIncrement(isCompound: boolean): number {
  return isCompound ? 5.0 : 2.5;
}

export interface ProgressiveOverloadResult {
  applied: boolean;
  updatedExercises: number;
}

/**
 * Checks whether the most recent completed session for this user achieved
 * 100% completion (all reps_done >= reps_target for every exercise in the
 * active plan). If so, increments weight_kg in PLAN_EXERCISES for each
 * exercise in the active plan.
 *
 * Called automatically at the start of each new session.
 *
 * Requirements: 4.4
 */
export async function applyProgressiveOverload(
  userId: string,
  planId: string,
): Promise<ProgressiveOverloadResult> {
  // 1. Find the most recent completed session for this user
  const lastSessions = await query<SessionRow>(
    `SELECT * FROM SESSIONS
     WHERE user_id = ? AND is_active = FALSE AND completed_at IS NOT NULL
     ORDER BY completed_at DESC
     LIMIT 1`,
    [userId],
  );

  if (lastSessions.length === 0) {
    return { applied: false, updatedExercises: 0 };
  }

  const lastSession = lastSessions[0]!;

  // 2. Get all plan exercises for the active plan (with is_compound from EXERCISES)
  const planExercises = await query<
    PlanExerciseRow & { is_compound: boolean | number; exercise_id: string }
  >(
    `SELECT pe.id, pe.exercise_id, pe.sets, pe.reps_target, pe.weight_kg,
            e.is_compound
     FROM PLAN_EXERCISES pe
     JOIN WORKOUT_DAYS wd ON pe.day_id = wd.id
     JOIN EXERCISES e ON pe.exercise_id = e.id
     WHERE wd.plan_id = ?`,
    [planId],
  );

  if (planExercises.length === 0) {
    return { applied: false, updatedExercises: 0 };
  }

  // 3. Check completion rate: for each exercise in the plan, verify that
  //    every set logged in the last session had reps_done >= reps_target.
  //    We need ALL exercises to be fully completed (100% completion rate).
  let allCompleted = true;

  for (const pe of planExercises) {
    // Count how many sets were logged for this exercise in the last session
    // with reps_done >= reps_target
    const completedSets = await query<{ completed_count: number }>(
      `SELECT COUNT(*) AS completed_count
       FROM SERIE_LOGS
       WHERE session_id = ? AND exercise_id = ? AND reps_done >= ?`,
      [lastSession.id, pe.exercise_id, pe.reps_target],
    );

    const completedCount = completedSets[0]?.completed_count ?? 0;

    // Also check total sets logged for this exercise in the session
    const totalSets = await query<{ total_count: number }>(
      `SELECT COUNT(*) AS total_count
       FROM SERIE_LOGS
       WHERE session_id = ? AND exercise_id = ?`,
      [lastSession.id, pe.exercise_id],
    );

    const totalCount = totalSets[0]?.total_count ?? 0;

    // Completion requires: at least pe.sets logged AND all met reps_target
    if (totalCount < pe.sets || completedCount < pe.sets) {
      allCompleted = false;
      break;
    }
  }

  if (!allCompleted) {
    return { applied: false, updatedExercises: 0 };
  }

  // 4. Apply progressive overload: increment weight_kg for each plan exercise
  let updatedCount = 0;

  for (const pe of planExercises) {
    const increment = calculateWeightIncrement(Boolean(pe.is_compound));
    await query(
      `UPDATE PLAN_EXERCISES SET weight_kg = weight_kg + ? WHERE id = ?`,
      [increment, pe.id],
    );
    updatedCount++;
  }

  return { applied: true, updatedExercises: updatedCount };
}

// ── Session & SerieLog types ──────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  started_at: Date;
  completed_at: Date | null;
  total_volume_kg: number | null;
  duration_seconds: number | null;
  is_active: boolean | number;
  offline_state: string | Record<string, unknown> | null;
}

export interface SerieLogRow {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps_done: number;
  logged_at: Date;
  is_pr: boolean | number;
}

export interface PersonalRecordRow {
  id: string;
  user_id: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  achieved_at: Date;
  /** Joined from EXERCISES */
  exercise_name?: string;
}

export interface UpdateSessionData {
  offline_state?: Record<string, unknown>;
}

// ── Session service functions ─────────────────────────────────────────────────

/**
 * Start a new training session for the user.
 * Inserts a SESSIONS row with is_active = true.
 * If a planId is provided and the previous session had 100% completion,
 * applies progressive overload to PLAN_EXERCISES before returning.
 *
 * Requirements: 4.4, 5.3
 */
export async function startSession(
  userId: string,
  planId?: string,
): Promise<SessionRow> {
  const sessionId = uuidv4();

  await query(
    `INSERT INTO SESSIONS (id, user_id, plan_id, started_at, is_active)
     VALUES (?, ?, ?, NOW(), TRUE)`,
    [sessionId, userId, planId ?? null],
  );

  // Apply progressive overload if a plan is associated with this session
  if (planId) {
    await applyProgressiveOverload(userId, planId);
  }

  const rows = await query<SessionRow>(
    `SELECT * FROM SESSIONS WHERE id = ?`,
    [sessionId],
  );

  if (rows.length === 0) {
    throw new Error('Failed to retrieve session after creation');
  }

  return rows[0]!;
}

/**
 * Update mutable fields of an active session (e.g. offline_state).
 *
 * Requirements: 5.3
 */
export async function updateSession(
  sessionId: string,
  userId: string,
  data: UpdateSessionData,
): Promise<SessionRow> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (data.offline_state !== undefined) {
    setClauses.push('offline_state = ?');
    params.push(JSON.stringify(data.offline_state));
  }

  if (setClauses.length === 0) {
    // Nothing to update — just return current state
    const rows = await query<SessionRow>(
      `SELECT * FROM SESSIONS WHERE id = ? AND user_id = ?`,
      [sessionId, userId],
    );
    if (rows.length === 0) {
      throw new Error('Session not found');
    }
    return rows[0]!;
  }

  params.push(sessionId, userId);

  await query(
    `UPDATE SESSIONS SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
    params,
  );

  const rows = await query<SessionRow>(
    `SELECT * FROM SESSIONS WHERE id = ? AND user_id = ?`,
    [sessionId, userId],
  );

  if (rows.length === 0) {
    throw new Error('Session not found');
  }

  return rows[0]!;
}

/**
 * Complete a session:
 *  - Calculate total_volume_kg = SUM(weight_kg × reps_done) from SERIE_LOGS
 *  - Calculate duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW())
 *  - Set is_active = false and completed_at = NOW()
 *
 * Requirements: 5.4
 */
export async function completeSession(
  sessionId: string,
  userId: string,
): Promise<SessionRow> {
  // Verify session belongs to user and is active
  const sessions = await query<SessionRow>(
    `SELECT * FROM SESSIONS WHERE id = ? AND user_id = ? AND is_active = TRUE`,
    [sessionId, userId],
  );

  if (sessions.length === 0) {
    throw new Error('Active session not found');
  }

  // Calculate total volume from serie logs
  const volumeResult = await query<{ total_volume: number | null }>(
    `SELECT SUM(weight_kg * reps_done) AS total_volume
     FROM SERIE_LOGS
     WHERE session_id = ?`,
    [sessionId],
  );

  const totalVolume = volumeResult[0]?.total_volume ?? 0;

  // Update session: set completed_at, duration, volume, is_active = false
  await query(
    `UPDATE SESSIONS
     SET completed_at = NOW(),
         duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()),
         total_volume_kg = ?,
         is_active = FALSE
     WHERE id = ? AND user_id = ?`,
    [totalVolume, sessionId, userId],
  );

  const rows = await query<SessionRow>(
    `SELECT * FROM SESSIONS WHERE id = ? AND user_id = ?`,
    [sessionId, userId],
  );

  if (rows.length === 0) {
    throw new Error('Session not found after completion');
  }

  return rows[0]!;
}

/**
 * Log a single serie for an exercise within a session.
 * After inserting, checks if this is a PR (weight_kg × reps_done > current PR).
 * If PR: upserts PERSONAL_RECORDS and marks is_pr = true on the SERIE_LOG.
 *
 * Requirements: 4.5, 5.3, 5.5
 */
export async function logSerie(
  userId: string,
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  weightKg: number,
  repsDone: number,
): Promise<SerieLogRow & { isPr: boolean }> {
  const serieId = uuidv4();

  // Insert the serie log (is_pr defaults to false)
  await query(
    `INSERT INTO SERIE_LOGS (id, session_id, exercise_id, set_number, weight_kg, reps_done, logged_at, is_pr)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), FALSE)`,
    [serieId, sessionId, exerciseId, setNumber, weightKg, repsDone],
  );

  // Check current PR for this user + exercise
  // PR is determined by the highest (weight_kg × reps) value
  const currentPrRows = await query<PersonalRecordRow>(
    `SELECT * FROM PERSONAL_RECORDS
     WHERE user_id = ? AND exercise_id = ?
     ORDER BY (weight_kg * reps) DESC
     LIMIT 1`,
    [userId, exerciseId],
  );

  const newVolume = weightKg * repsDone;
  const currentPr = currentPrRows[0];
  const currentPrVolume = currentPr ? currentPr.weight_kg * currentPr.reps : 0;

  let isPr = false;

  if (newVolume > currentPrVolume) {
    isPr = true;

    // Upsert PERSONAL_RECORDS
    if (currentPr) {
      await query(
        `UPDATE PERSONAL_RECORDS
         SET weight_kg = ?, reps = ?, achieved_at = NOW()
         WHERE user_id = ? AND exercise_id = ?`,
        [weightKg, repsDone, userId, exerciseId],
      );
    } else {
      await query(
        `INSERT INTO PERSONAL_RECORDS (id, user_id, exercise_id, weight_kg, reps, achieved_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), userId, exerciseId, weightKg, repsDone],
      );
    }

    // Mark is_pr = true on the serie log
    await query(
      `UPDATE SERIE_LOGS SET is_pr = TRUE WHERE id = ?`,
      [serieId],
    );
  }

  const rows = await query<SerieLogRow>(
    `SELECT * FROM SERIE_LOGS WHERE id = ?`,
    [serieId],
  );

  if (rows.length === 0) {
    throw new Error('Failed to retrieve serie log after creation');
  }

  return { ...rows[0]!, isPr };
}

/**
 * Fetch session history for a user, ordered by started_at DESC.
 *
 * Requirements: 5.3
 */
export async function getSessions(userId: string): Promise<SessionRow[]> {
  return query<SessionRow>(
    `SELECT * FROM SESSIONS WHERE user_id = ? ORDER BY started_at DESC`,
    [userId],
  );
}

/**
 * Fetch all personal records for a user, joined with exercise name.
 *
 * Requirements: 4.5
 */
export async function getPersonalRecords(userId: string): Promise<PersonalRecordRow[]> {
  return query<PersonalRecordRow>(
    `SELECT pr.*, e.name AS exercise_name
     FROM PERSONAL_RECORDS pr
     JOIN EXERCISES e ON pr.exercise_id = e.id
     WHERE pr.user_id = ?
     ORDER BY e.name`,
    [userId],
  );
}

// ── Active plan retrieval ─────────────────────────────────────────────────────

/**
 * Fetch the active workout plan for a user, including days and exercises.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export async function getActivePlan(userId: string): Promise<ActivePlan | null> {
  // Fetch the active plan
  const plans = await query<WorkoutPlanRow>(
    `SELECT * FROM WORKOUT_PLANS WHERE user_id = ? AND is_active = TRUE LIMIT 1`,
    [userId],
  );

  if (plans.length === 0) {
    return null;
  }

  const plan = plans[0]!;

  // Fetch days for this plan
  const days = await query<WorkoutDayRow>(
    `SELECT * FROM WORKOUT_DAYS WHERE plan_id = ? ORDER BY day_of_week`,
    [plan.id],
  );

  // Fetch exercises for each day
  const daysWithExercises: WorkoutDayWithExercises[] = await Promise.all(
    days.map(async (day) => {
      const exercises = await query<PlanExerciseRow>(
        `SELECT pe.*, e.name AS exercise_name, e.muscle_groups, e.equipment_type,
                e.gif_url, e.video_url, e.is_compound
         FROM PLAN_EXERCISES pe
         JOIN EXERCISES e ON pe.exercise_id = e.id
         WHERE pe.day_id = ?
         ORDER BY pe.order_index`,
        [day.id],
      );
      return { ...day, exercises };
    }),
  );

  return { ...plan, days: daysWithExercises };
}
