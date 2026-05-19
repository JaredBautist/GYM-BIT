/**
 * Profile router — mounts all /profile/* endpoints.
 *
 * GET    /profile                — obtener perfil completo
 * PUT    /profile                — actualizar perfil
 * POST   /profile/weight         — registrar nuevo peso
 * GET    /profile/weight/history — historial de peso
 * GET    /profile/metrics        — IMC, TMB, TDEE actuales
 *
 * All routes require a valid JWT (authenticate middleware applied in app.ts).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import {
  getProfile,
  updateProfile,
  recordWeight,
  getWeightHistory,
  getMetrics,
  type UpdateProfileInput,
} from '../../services/profile.service.js';

export const profileRouter = Router();

// ── Input validation schemas ──────────────────────────────────────────────────

const updateProfileSchema = z.object({
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'birth_date must be in YYYY-MM-DD format')
    .optional(),
  gender: z.enum(['male', 'female']).optional(),
  height_cm: z.number().min(100).max(250).optional(),
  weight_kg: z.number().min(30).max(300).optional(),
  goal: z
    .enum(['LOSE_WEIGHT', 'GAIN_MUSCLE', 'GAIN_WEIGHT', 'MAINTENANCE', 'ENDURANCE'])
    .optional(),
  experience_level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  available_days: z.number().int().min(1).max(7).optional(),
  medical_conditions: z.string().max(2000).optional(),
});

const recordWeightSchema = z.object({
  weight_kg: z.number().min(30).max(300),
});

// ── Helper: wrap async route handlers ────────────────────────────────────────

/**
 * Wraps an async handler that expects an AuthenticatedRequest.
 * The cast to Request is safe because the authenticate middleware (applied
 * globally in app.ts before this router) guarantees userId is present.
 */
function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

// ── Helper: map service error codes to HTTP responses ────────────────────────

function errorResponse(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code;

    switch (code) {
      case 'INVALID_HEIGHT':
      case 'INVALID_WEIGHT':
      case 'UNDERAGE':
        res.status(400).json({ error: 'Validation error', message: err.message, code });
        return;
      default:
        res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── GET /profile ──────────────────────────────────────────────────────────────

profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const profile = await getProfile(req.userId);
    if (!profile) {
      res.status(404).json({
        error: 'Not found',
        message: 'El perfil no existe todavía. Usa PUT /profile para crearlo.',
        code: 'PROFILE_NOT_FOUND',
      });
      return;
    }
    res.status(200).json(profile);
  }),
);

// ── PUT /profile ──────────────────────────────────────────────────────────────

profileRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    // Build UpdateProfileInput, only including defined fields to satisfy
    // exactOptionalPropertyTypes — undefined keys must not be present.
    const input: UpdateProfileInput = {};
    const d = parsed.data;
    if (d.birth_date !== undefined) input.birth_date = d.birth_date;
    if (d.gender !== undefined) input.gender = d.gender;
    if (d.height_cm !== undefined) input.height_cm = d.height_cm;
    if (d.weight_kg !== undefined) input.weight_kg = d.weight_kg;
    if (d.goal !== undefined) input.goal = d.goal;
    if (d.experience_level !== undefined) input.experience_level = d.experience_level;
    if (d.available_days !== undefined) input.available_days = d.available_days;
    if (d.medical_conditions !== undefined) input.medical_conditions = d.medical_conditions;

    try {
      const profile = await updateProfile(req.userId, input);
      res.status(200).json(profile);
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── POST /profile/weight ──────────────────────────────────────────────────────

profileRouter.post(
  '/weight',
  asyncHandler(async (req, res) => {
    const parsed = recordWeightSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'El peso debe ser un número entre 30 y 300 kg.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const entry = await recordWeight(req.userId, parsed.data.weight_kg);
      res.status(201).json(entry);
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── GET /profile/weight/history ───────────────────────────────────────────────

profileRouter.get(
  '/weight/history',
  asyncHandler(async (req, res) => {
    const history = await getWeightHistory(req.userId);
    res.status(200).json(history);
  }),
);

// ── GET /profile/metrics ──────────────────────────────────────────────────────

profileRouter.get(
  '/metrics',
  asyncHandler(async (req, res) => {
    const metrics = await getMetrics(req.userId);
    res.status(200).json(metrics);
  }),
);
