/**
 * Workouts router — mounts exercise catalogue and workout plan endpoints.
 *
 * GET  /exercises              — catálogo de ejercicios (filtros: muscleGroup, equipment)
 * POST /workouts/generate      — generar plan de entrenamiento
 * GET  /workouts/plan          — plan activo del usuario
 * GET  /workouts/sessions      — historial de sesiones
 * POST /workouts/sessions      — iniciar sesión de entrenamiento
 * PUT  /workouts/sessions/:id  — actualizar sesión activa
 * POST /workouts/sessions/:id/complete — completar sesión
 * POST /workouts/series        — registrar serie (peso, reps, timestamp)
 * GET  /workouts/prs           — personal records por ejercicio
 *
 * All routes require a valid JWT (authenticate middleware applied in app.ts).
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 5.3, 5.4, 5.5
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import {
  getExercises,
  generateWorkoutPlan,
  getActivePlan,
  startSession,
  updateSession,
  completeSession,
  logSerie,
  getSessions,
  getPersonalRecords,
  type ExerciseFilters,
  type GenerateWorkoutInput,
} from '../../services/workout.service.js';

// ── Routers ───────────────────────────────────────────────────────────────────

export const workoutRouter = Router();
export const exercisesRouter = Router();

// ── Input validation schemas ──────────────────────────────────────────────────

const generateWorkoutSchema = z.object({
  goal: z.enum(['LOSE_WEIGHT', 'GAIN_MUSCLE', 'GAIN_WEIGHT', 'MAINTENANCE', 'ENDURANCE']),
  experienceLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  availableDays: z.number().int().min(1).max(7),
  equipment: z.array(z.string()).optional(),
});

const exerciseFiltersSchema = z.object({
  muscleGroup: z.string().optional(),
  equipment: z.string().optional(),
});

const startSessionSchema = z.object({
  planId: z.string().uuid().optional(),
});

const updateSessionSchema = z.object({
  offline_state: z.record(z.unknown()).optional(),
});

const logSerieSchema = z.object({
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1),
  weightKg: z.number().min(0),
  repsDone: z.number().int().min(1),
});

// ── Helper: wrap async route handlers ────────────────────────────────────────

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

// ── GET /exercises ────────────────────────────────────────────────────────────

/**
 * Returns the exercise catalogue, optionally filtered by muscle group and/or
 * equipment type.
 *
 * Query params:
 *   muscleGroup  — e.g. "chest", "back", "legs"
 *   equipment    — e.g. "barbell", "dumbbell", "bodyweight"
 *
 * Requirements: 4.2, 4.6
 */
exercisesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = exerciseFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Parámetros de filtro inválidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const filters: ExerciseFilters = {};
    if (parsed.data.muscleGroup !== undefined) filters.muscleGroup = parsed.data.muscleGroup;
    if (parsed.data.equipment !== undefined) filters.equipment = parsed.data.equipment;

    const exercises = await getExercises(filters);
    res.status(200).json(exercises);
  }),
);

// ── POST /workouts/generate ───────────────────────────────────────────────────

/**
 * Generates a new personalised workout plan for the authenticated user.
 *
 * Body:
 *   goal            — user's fitness goal
 *   experienceLevel — BEGINNER | INTERMEDIATE | ADVANCED
 *   availableDays   — number of training days per week (1–7)
 *   equipment       — optional array of available equipment types
 *
 * Requirements: 4.1, 4.2, 4.3, 4.6, 4.7
 */
workoutRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const parsed = generateWorkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const input: GenerateWorkoutInput = {
      goal: parsed.data.goal,
      experienceLevel: parsed.data.experienceLevel,
      availableDays: parsed.data.availableDays,
    };
    if (parsed.data.equipment !== undefined) input.equipment = parsed.data.equipment;

    const plan = await generateWorkoutPlan(req.userId, input);
    res.status(201).json(plan);
  }),
);

// ── GET /workouts/plan ────────────────────────────────────────────────────────

/**
 * Returns the currently active workout plan for the authenticated user,
 * including all days and their exercises.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
workoutRouter.get(
  '/plan',
  asyncHandler(async (req, res) => {
    const plan = await getActivePlan(req.userId);
    if (!plan) {
      res.status(404).json({
        error: 'Not found',
        message: 'No hay un plan de entrenamiento activo. Usa POST /workouts/generate para crear uno.',
        code: 'PLAN_NOT_FOUND',
      });
      return;
    }
    res.status(200).json(plan);
  }),
);

// ── GET /workouts/sessions ────────────────────────────────────────────────────

/**
 * Returns the session history for the authenticated user, ordered by
 * started_at DESC.
 *
 * Requirements: 5.3
 */
workoutRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const sessions = await getSessions(req.userId);
    res.status(200).json(sessions);
  }),
);

// ── POST /workouts/sessions ───────────────────────────────────────────────────

/**
 * Starts a new training session for the authenticated user.
 *
 * Body (optional):
 *   planId — UUID of the workout plan to associate with this session
 *
 * Requirements: 5.3
 */
workoutRouter.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const parsed = startSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const session = await startSession(req.userId, parsed.data.planId);
    res.status(201).json(session);
  }),
);

// ── PUT /workouts/sessions/:id ────────────────────────────────────────────────

/**
 * Updates mutable fields of an active session (e.g. offline_state).
 *
 * Body:
 *   offline_state — JSON object with the current offline state snapshot
 *
 * Requirements: 5.3
 */
workoutRouter.put(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const updateData: import('../../services/workout.service.js').UpdateSessionData = {};
      if (parsed.data.offline_state !== undefined) {
        updateData.offline_state = parsed.data.offline_state;
      }
      const session = await updateSession(req.params['id'] as string, req.userId, updateData);
      res.status(200).json(session);
    } catch (err) {
      if (err instanceof Error && err.message === 'Session not found') {
        res.status(404).json({
          error: 'Not found',
          message: 'Sesión no encontrada.',
          code: 'SESSION_NOT_FOUND',
        });
        return;
      }
      throw err;
    }
  }),
);

// ── POST /workouts/sessions/:id/complete ─────────────────────────────────────

/**
 * Completes an active session:
 *  - Calculates total_volume_kg (sum of weight_kg × reps_done)
 *  - Calculates duration_seconds (completed_at - started_at)
 *  - Sets is_active = false
 *
 * Requirements: 5.4
 */
workoutRouter.post(
  '/sessions/:id/complete',
  asyncHandler(async (req, res) => {
    try {
      const session = await completeSession(req.params['id'] as string, req.userId);
      res.status(200).json(session);
    } catch (err) {
      if (err instanceof Error && err.message === 'Active session not found') {
        res.status(404).json({
          error: 'Not found',
          message: 'No se encontró una sesión activa con ese ID.',
          code: 'SESSION_NOT_FOUND',
        });
        return;
      }
      throw err;
    }
  }),
);

// ── POST /workouts/series ─────────────────────────────────────────────────────

/**
 * Logs a single serie for an exercise within a session.
 * Automatically detects and records PRs.
 *
 * Body:
 *   sessionId  — UUID of the active session
 *   exerciseId — UUID of the exercise
 *   setNumber  — set number within the exercise (1-based)
 *   weightKg   — weight used in kg (0 for bodyweight)
 *   repsDone   — number of repetitions completed
 *
 * Requirements: 4.5, 5.3, 5.5
 */
workoutRouter.post(
  '/series',
  asyncHandler(async (req, res) => {
    const parsed = logSerieSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const { sessionId, exerciseId, setNumber, weightKg, repsDone } = parsed.data;
    const serie = await logSerie(req.userId, sessionId, exerciseId, setNumber, weightKg, repsDone);
    res.status(201).json(serie);
  }),
);

// ── GET /workouts/prs ─────────────────────────────────────────────────────────

/**
 * Returns all personal records for the authenticated user,
 * joined with exercise name.
 *
 * Requirements: 4.5
 */
workoutRouter.get(
  '/prs',
  asyncHandler(async (req, res) => {
    const prs = await getPersonalRecords(req.userId);
    res.status(200).json(prs);
  }),
);
