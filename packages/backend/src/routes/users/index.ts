/**
 * Users router — endpoints de gestión de cuenta (GDPR).
 *
 * DELETE /users/:id  — eliminación permanente de datos (≤ 30 días)
 * GET    /users/:id/export — exportación de datos en JSON (< 24 h)
 *
 * Requirements: 13.3, 13.4, 13.5
 */

import { Router, type Request, type Response, type NextFunction } from 'express';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { query, withTransaction } from '../../db/pool.js';

export const usersRouter = Router();

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

// ── DELETE /users/:id — eliminación permanente (GDPR) ─────────────────────────

/**
 * Elimina permanentemente todos los datos personales del usuario.
 * Solo el propio usuario puede eliminar su cuenta.
 * Plazo máximo: 30 días (aquí se ejecuta inmediatamente).
 *
 * Requirements: 13.4
 */
usersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const targetId = req.params['id'];

    // Solo el propio usuario puede eliminar su cuenta
    if (targetId !== req.userId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Solo puedes eliminar tu propia cuenta.',
        code: 'FORBIDDEN',
      });
      return;
    }

    await withTransaction(async (conn) => {
      // Eliminar en orden para respetar FK constraints
      await conn.execute('DELETE FROM offline_queue WHERE user_id = ?', [targetId]);
      await conn.execute('DELETE FROM notification_settings WHERE user_id = ?', [targetId]);
      await conn.execute('DELETE FROM wearable_data WHERE user_id = ?', [targetId]);
      await conn.execute('DELETE FROM wearable_connections WHERE user_id = ?', [targetId]);
      await conn.execute('DELETE FROM sleep_records WHERE user_id = ?', [targetId]);

      // Nutrition
      await conn.execute(
        `DELETE fl FROM food_logs fl
         JOIN meals m ON fl.meal_id = m.id
         JOIN daily_records dr ON m.daily_record_id = dr.id
         WHERE dr.user_id = ?`,
        [targetId],
      );
      await conn.execute(
        `DELETE m FROM meals m
         JOIN daily_records dr ON m.daily_record_id = dr.id
         WHERE dr.user_id = ?`,
        [targetId],
      );
      await conn.execute('DELETE FROM daily_records WHERE user_id = ?', [targetId]);
      await conn.execute(
        `DELETE ri FROM recipe_ingredients ri
         JOIN recipes r ON ri.recipe_id = r.id
         WHERE r.user_id = ?`,
        [targetId],
      );
      await conn.execute('DELETE FROM recipes WHERE user_id = ?', [targetId]);
      await conn.execute('DELETE FROM nutrition_plans WHERE user_id = ?', [targetId]);

      // Workout
      await conn.execute(
        `DELETE sl FROM serie_logs sl
         JOIN sessions s ON sl.session_id = s.id
         WHERE s.user_id = ?`,
        [targetId],
      );
      await conn.execute('DELETE FROM sessions WHERE user_id = ?', [targetId]);
      await conn.execute('DELETE FROM personal_records WHERE user_id = ?', [targetId]);
      await conn.execute(
        `DELETE pe FROM plan_exercises pe
         JOIN workout_days wd ON pe.day_id = wd.id
         JOIN workout_plans wp ON wd.plan_id = wp.id
         WHERE wp.user_id = ?`,
        [targetId],
      );
      await conn.execute(
        `DELETE wd FROM workout_days wd
         JOIN workout_plans wp ON wd.plan_id = wp.id
         WHERE wp.user_id = ?`,
        [targetId],
      );
      await conn.execute('DELETE FROM workout_plans WHERE user_id = ?', [targetId]);

      // Profile & weight
      await conn.execute('DELETE FROM weight_history WHERE user_id = ?', [targetId]);
      await conn.execute('DELETE FROM profiles WHERE user_id = ?', [targetId]);

      // User account
      await conn.execute('DELETE FROM users WHERE id = ?', [targetId]);
    });

    res.status(204).send();
  }),
);

// ── GET /users/:id/export — exportación de datos (GDPR) ──────────────────────

/**
 * Exporta todos los datos personales del usuario en formato JSON.
 * Solo el propio usuario puede exportar sus datos.
 *
 * Requirements: 13.5
 */
usersRouter.get(
  '/:id/export',
  asyncHandler(async (req, res) => {
    const targetId = req.params['id'];

    if (targetId !== req.userId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Solo puedes exportar tus propios datos.',
        code: 'FORBIDDEN',
      });
      return;
    }

    // Recopilar todos los datos del usuario
    const [
      user, profile, weightHistory, workoutPlans, sessions,
      nutritionPlans, dailyRecords, sleepRecords, wearableData,
      personalRecords, recipes,
    ] = await Promise.all([
      query('SELECT id, email, name, created_at, updated_at FROM users WHERE id = ?', [targetId]),
      query('SELECT * FROM profiles WHERE user_id = ?', [targetId]),
      query('SELECT * FROM weight_history WHERE user_id = ? ORDER BY recorded_at DESC', [targetId]),
      query('SELECT * FROM workout_plans WHERE user_id = ? ORDER BY generated_at DESC', [targetId]),
      query('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 100', [targetId]),
      query('SELECT * FROM nutrition_plans WHERE user_id = ? ORDER BY generated_at DESC', [targetId]),
      query('SELECT * FROM daily_records WHERE user_id = ? ORDER BY record_date DESC LIMIT 90', [targetId]),
      query('SELECT * FROM sleep_records WHERE user_id = ? ORDER BY sleep_start DESC LIMIT 90', [targetId]),
      query('SELECT provider, data_date, steps, calories_burned, avg_heart_rate, vo2max FROM wearable_data WHERE user_id = ? ORDER BY data_date DESC LIMIT 90', [targetId]),
      query('SELECT pr.*, e.name AS exercise_name FROM personal_records pr JOIN exercises e ON pr.exercise_id = e.id WHERE pr.user_id = ?', [targetId]),
      query('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC', [targetId]),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      userId: targetId,
      user: user[0] ?? null,
      profile: profile[0] ?? null,
      weightHistory,
      workoutPlans,
      sessions,
      nutritionPlans,
      dailyRecords,
      sleepRecords,
      wearableData,
      personalRecords,
      recipes,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gymbit-data-${targetId}.json"`);
    res.status(200).json(exportData);
  }),
);
