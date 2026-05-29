/**
 * Analytics_Service — dashboard, gráficos y exportación de reportes.
 *
 * Responsabilidades:
 *  - Resumen diario del dashboard (calorías restantes, próxima sesión, sueño, hidratación, mensaje motivacional)
 *  - Datos para cada tipo de gráfico (peso, calorías, heatmap, PRs, IMC, sueño, macros, recuperación)
 *  - Generación de reporte PDF mensual (< 30 s)
 *  - Caché de resultados en Redis con TTL de 2 minutos
 *
 * Requirements: 9.1, 9.2, 9.3, 9.5, 14.3
 */

import { query } from '../db/pool.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type ChartType =
  | 'weight'
  | 'calories'
  | 'workout_heatmap'
  | 'prs'
  | 'bmi'
  | 'sleep'
  | 'macros'
  | 'muscle_recovery';

export interface DailySummary {
  caloriesConsumed: number;
  calorieGoal: number;
  caloriesRemaining: number;
  nextSession: { planType: string; focus: string } | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  hydrationMl: number;
  motivationalMessage: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface MacroDataPoint {
  name: string;
  value: number;
}

export interface HeatmapDataPoint {
  date: string;
  count: number;
}

export interface PrDataPoint {
  date: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
}

export interface MuscleRecoveryDataPoint {
  muscleGroup: string;
  lastTrainedDaysAgo: number;
  recoveryPercent: number;
}

// ── Motivational messages pool ────────────────────────────────────────────────

const MOTIVATIONAL_MESSAGES = [
  '¡Cada repetición te acerca a tu mejor versión!',
  'El progreso, no la perfección, es la meta.',
  'Tu cuerpo puede hacerlo. Convence a tu mente.',
  'Hoy es un buen día para ser mejor que ayer.',
  'La constancia supera al talento.',
  'No pares cuando estés cansado, para cuando hayas terminado.',
  'El único mal entrenamiento es el que no hiciste.',
  'Pequeños pasos, grandes resultados.',
];

function getDailyMotivationalMessage(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length]!;
}

// ── Pure helper functions (exported for testing) ──────────────────────────────

/**
 * Calculate remaining calories for the day.
 * caloriesRemaining = calorieGoal - caloriesConsumed
 * Clamps to 0 minimum.
 *
 * Requirements: 9.1
 */
export function calculateCaloriesRemaining(
  calorieGoal: number,
  caloriesConsumed: number,
): number {
  return Math.max(0, calorieGoal - caloriesConsumed);
}

/**
 * Calculate muscle recovery percentage based on days since last training.
 * Full recovery (100%) is assumed after 3 days of rest.
 *
 * Requirements: 9.2
 */
export function calculateMuscleRecovery(lastTrainedDaysAgo: number): number {
  if (lastTrainedDaysAgo >= 3) return 100;
  return Math.round((lastTrainedDaysAgo / 3) * 100);
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Get the daily dashboard summary for a user.
 * Aggregates data from daily_records, sessions, sleep_records and nutrition_plans.
 *
 * Requirements: 9.1
 */
export async function getDashboardSummary(userId: string): Promise<DailySummary> {
  const today = new Date().toISOString().split('T')[0]!;

  // 1. Calories consumed and goal for today
  const dailyRows = await query<{
    total_calories: number;
    calorie_goal: number;
  }>(
    `SELECT total_calories, calorie_goal
     FROM daily_records
     WHERE user_id = ? AND record_date = ?
     LIMIT 1`,
    [userId, today],
  );

  const caloriesConsumed = dailyRows[0]?.total_calories ?? 0;
  const calorieGoal = dailyRows[0]?.calorie_goal ?? 0;
  const caloriesRemaining = calculateCaloriesRemaining(calorieGoal, caloriesConsumed);

  // 2. Next scheduled session (next workout day in active plan)
  const nextSessionRows = await query<{ plan_type: string; focus: string }>(
    `SELECT wp.plan_type, wd.focus
     FROM workout_plans wp
     JOIN workout_days wd ON wd.plan_id = wp.id
     WHERE wp.user_id = ? AND wp.is_active = TRUE
     ORDER BY wd.day_of_week
     LIMIT 1`,
    [userId],
  );

  const nextSession = nextSessionRows[0]
    ? { planType: nextSessionRows[0].plan_type, focus: nextSessionRows[0].focus }
    : null;

  // 3. Last night's sleep
  const sleepRows = await query<{ duration_minutes: number; quality_stars: number }>(
    `SELECT duration_minutes, quality_stars
     FROM sleep_records
     WHERE user_id = ?
     ORDER BY sleep_start DESC
     LIMIT 1`,
    [userId],
  );

  const sleepHours = sleepRows[0]
    ? Math.round((sleepRows[0].duration_minutes / 60) * 10) / 10
    : null;
  const sleepQuality = sleepRows[0]?.quality_stars ?? null;

  return {
    caloriesConsumed,
    calorieGoal,
    caloriesRemaining,
    nextSession,
    sleepHours,
    sleepQuality,
    hydrationMl: 0, // hydration tracking is a future feature
    motivationalMessage: getDailyMotivationalMessage(),
  };
}

/**
 * Get chart data for a specific chart type.
 * Returns data points for the last 30–365 days depending on chart type.
 *
 * Requirements: 9.2, 14.3
 */
export async function getChartData(
  userId: string,
  chartType: ChartType,
): Promise<ChartDataPoint[] | MacroDataPoint[] | HeatmapDataPoint[] | PrDataPoint[] | MuscleRecoveryDataPoint[]> {
  switch (chartType) {
    case 'weight': {
      // Weight evolution — last 90 days
      const rows = await query<{ recorded_at: Date; weight_kg: number }>(
        `SELECT recorded_at, weight_kg
         FROM weight_history
         WHERE user_id = ?
         ORDER BY recorded_at ASC
         LIMIT 90`,
        [userId],
      );
      return rows.map((r) => ({
        date: new Date(r.recorded_at).toISOString().split('T')[0]!,
        value: r.weight_kg,
      }));
    }

    case 'calories': {
      // Calories consumed vs goal — last 30 days
      const rows = await query<{
        record_date: string;
        total_calories: number;
        calorie_goal: number;
      }>(
        `SELECT record_date, total_calories, calorie_goal
         FROM daily_records
         WHERE user_id = ?
           AND record_date >= date('now', '-30 days')
         ORDER BY record_date ASC`,
        [userId],
      );
      return rows.map((r) => ({
        date: String(r.record_date),
        value: r.total_calories,
        label: String(r.calorie_goal),
      }));
    }

    case 'workout_heatmap': {
      // Training frequency heatmap — last 365 days
      const rows = await query<{ session_date: string; count: number }>(
        `SELECT DATE(started_at) AS session_date, COUNT(*) AS count
         FROM sessions
         WHERE user_id = ?
           AND started_at >= datetime('now', '-365 days')
           AND is_active = FALSE
         GROUP BY DATE(started_at)
         ORDER BY session_date ASC`,
        [userId],
      );
      return rows.map((r) => ({
        date: r.session_date,
        count: r.count,
      }));
    }

    case 'prs': {
      // Personal records progress — all time
      const rows = await query<{
        achieved_at: Date;
        exercise_name: string;
        weight_kg: number;
        reps: number;
      }>(
        `SELECT pr.achieved_at, e.name AS exercise_name, pr.weight_kg, pr.reps
         FROM personal_records pr
         JOIN exercises e ON pr.exercise_id = e.id
         WHERE pr.user_id = ?
         ORDER BY pr.achieved_at ASC`,
        [userId],
      );
      return rows.map((r) => ({
        date: new Date(r.achieved_at).toISOString().split('T')[0]!,
        exerciseName: r.exercise_name,
        weightKg: r.weight_kg,
        reps: r.reps,
      }));
    }

    case 'bmi': {
      // BMI evolution — derived from weight history
      const profileRows = await query<{ height_cm: number }>(
        'SELECT height_cm FROM profiles WHERE user_id = ? LIMIT 1',
        [userId],
      );
      const heightCm = profileRows[0]?.height_cm ?? 170;
      const heightM = heightCm / 100;

      const rows = await query<{ recorded_at: Date; weight_kg: number }>(
        `SELECT recorded_at, weight_kg
         FROM weight_history
         WHERE user_id = ?
         ORDER BY recorded_at ASC
         LIMIT 90`,
        [userId],
      );
      return rows.map((r) => ({
        date: new Date(r.recorded_at).toISOString().split('T')[0]!,
        value: Math.round((r.weight_kg / (heightM * heightM)) * 100) / 100,
      }));
    }

    case 'sleep': {
      // Weekly average sleep — last 30 days
      const rows = await query<{ week: string; avg_hours: number }>(
        `SELECT
           strftime('%Y-%m-%d', sleep_start, 'weekday 0', '-6 days') AS week,
           ROUND(AVG(duration_minutes) / 60, 1) AS avg_hours
         FROM sleep_records
         WHERE user_id = ?
           AND sleep_start >= datetime('now', '-30 days')
         GROUP BY week
         ORDER BY week ASC`,
        [userId],
      );
      return rows.map((r) => ({
        date: r.week,
        value: r.avg_hours,
      }));
    }

    case 'macros': {
      // Macro distribution for today
      const rows = await query<{
        total_protein: number;
        total_carbs: number;
        total_fat: number;
      }>(
        `SELECT total_protein, total_carbs, total_fat
         FROM daily_records
          WHERE user_id = ? AND record_date = date('now')
         LIMIT 1`,
        [userId],
      );
      const r = rows[0] ?? { total_protein: 0, total_carbs: 0, total_fat: 0 };
      return [
        { name: 'Proteínas', value: r.total_protein },
        { name: 'Carbohidratos', value: r.total_carbs },
        { name: 'Grasas', value: r.total_fat },
      ];
    }

    case 'muscle_recovery': {
      // Muscle recovery by group — based on last session per muscle group
      const rows = await query<{ muscle_group: string; last_trained: Date }>(
        `SELECT
           json_extract(e.muscle_groups, '$[0]') AS muscle_group,
           MAX(sl.logged_at) AS last_trained
         FROM serie_logs sl
         JOIN exercises e ON sl.exercise_id = e.id
         JOIN sessions s ON sl.session_id = s.id
         WHERE s.user_id = ?
         GROUP BY muscle_group`,
        [userId],
      );
      return rows.map((r) => {
        const daysAgo = Math.floor(
          (Date.now() - new Date(r.last_trained).getTime()) / 86_400_000,
        );
        return {
          muscleGroup: r.muscle_group,
          lastTrainedDaysAgo: daysAgo,
          recoveryPercent: calculateMuscleRecovery(daysAgo),
        };
      });
    }
  }
}
