/**
 * Sleep router — endpoints de registro y consulta del ciclo de sueño.
 *
 * POST /sleep              — registrar sueño manual
 * GET  /sleep/history      — historial de sueño
 * GET  /sleep/latest       — último registro de sueño
 * POST /sleep/wearable     — importar datos de fases desde wearable
 *
 * Todos los endpoints requieren JWT válido (middleware authenticate en app.ts).
 *
 * Requirements: 8.1, 8.2, 8.3
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import {
  createSleepRecord,
  importWearableSleep,
  getSleepHistory,
  getLatestSleepRecord,
} from '../../services/sleep.service.js';

// ── Router ────────────────────────────────────────────────────────────────────

export const sleepRouter = Router();

// ── Input validation schemas ──────────────────────────────────────────────────

const createSleepSchema = z.object({
  sleepStart: z.string().datetime({ message: 'sleepStart debe ser una fecha ISO 8601 válida.' }),
  sleepEnd: z.string().datetime({ message: 'sleepEnd debe ser una fecha ISO 8601 válida.' }),
  qualityStars: z
    .number()
    .int('qualityStars debe ser un entero.')
    .min(1, 'La calidad mínima es 1 estrella.')
    .max(5, 'La calidad máxima es 5 estrellas.'),
});

const importWearableSchema = z.object({
  sleepStart: z.string().datetime({ message: 'sleepStart debe ser una fecha ISO 8601 válida.' }),
  sleepEnd: z.string().datetime({ message: 'sleepEnd debe ser una fecha ISO 8601 válida.' }),
  qualityStars: z
    .number()
    .int('qualityStars debe ser un entero.')
    .min(1, 'La calidad mínima es 1 estrella.')
    .max(5, 'La calidad máxima es 5 estrellas.'),
  phases: z
    .object({
      remMinutes: z.number().int().min(0).optional(),
      deepMinutes: z.number().int().min(0).optional(),
      lightMinutes: z.number().int().min(0).optional(),
    })
    .optional(),
});

// ── Helper: wrap async route handlers ────────────────────────────────────────

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

// ── POST /sleep ───────────────────────────────────────────────────────────────

/**
 * Registrar sueño manualmente.
 * Calcula la duración a partir de sleepStart y sleepEnd.
 *
 * Body:
 *   sleepStart   — ISO 8601 datetime
 *   sleepEnd     — ISO 8601 datetime
 *   qualityStars — entero 1–5
 *
 * Requirements: 8.1
 */
sleepRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSleepSchema.safeParse(req.body);
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
      const record = await createSleepRecord(req.userId, {
        sleepStart: parsed.data.sleepStart,
        sleepEnd: parsed.data.sleepEnd,
        qualityStars: parsed.data.qualityStars,
      });
      res.status(201).json(record);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'INVALID_QUALITY' || code === 'INVALID_SLEEP_TIMES') {
        res.status(422).json({
          error: 'Unprocessable Entity',
          message: (err as Error).message,
          code,
        });
        return;
      }
      throw err;
    }
  }),
);

// ── GET /sleep/history ────────────────────────────────────────────────────────

/**
 * Obtener el historial de sueño del usuario autenticado.
 * Devuelve hasta 90 registros ordenados por fecha descendente.
 *
 * Requirements: 8.1
 */
sleepRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const history = await getSleepHistory(req.userId);
    res.status(200).json(history);
  }),
);

// ── GET /sleep/latest ─────────────────────────────────────────────────────────

/**
 * Obtener el registro de sueño más reciente del usuario autenticado.
 * Devuelve 404 si no hay registros.
 *
 * Requirements: 8.1, 8.3
 */
sleepRouter.get(
  '/latest',
  asyncHandler(async (req, res) => {
    const record = await getLatestSleepRecord(req.userId);

    if (!record) {
      res.status(404).json({
        error: 'Not found',
        message: 'No se encontraron registros de sueño.',
        code: 'SLEEP_RECORD_NOT_FOUND',
      });
      return;
    }

    res.status(200).json(record);
  }),
);

// ── POST /sleep/wearable ──────────────────────────────────────────────────────

/**
 * Importar datos de sueño desde un wearable conectado.
 * Incluye fases de sueño (REM, profundo, ligero).
 *
 * Body:
 *   sleepStart   — ISO 8601 datetime
 *   sleepEnd     — ISO 8601 datetime
 *   qualityStars — entero 1–5
 *   phases       — { remMinutes?, deepMinutes?, lightMinutes? } (opcional)
 *
 * Requirements: 8.2
 */
sleepRouter.post(
  '/wearable',
  asyncHandler(async (req, res) => {
    const parsed = importWearableSchema.safeParse(req.body);
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
      const record = await importWearableSleep(req.userId, {
        sleepStart: parsed.data.sleepStart,
        sleepEnd: parsed.data.sleepEnd,
        qualityStars: parsed.data.qualityStars,
        phases: parsed.data.phases,
      });
      res.status(201).json(record);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'INVALID_QUALITY' || code === 'INVALID_SLEEP_TIMES') {
        res.status(422).json({
          error: 'Unprocessable Entity',
          message: (err as Error).message,
          code,
        });
        return;
      }
      throw err;
    }
  }),
);
