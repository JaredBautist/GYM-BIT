/**
 * Sync router — sincronización offline/online.
 *
 * POST /sync/push   — enviar Cola_Offline al servidor
 * GET  /sync/pull   — obtener cambios del servidor
 * GET  /sync/status — estado de sincronización
 *
 * Requirements: 12.2, 12.3, 12.4
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import {
  processSyncPush,
  processSyncPull,
  getSyncStatus,
} from '../../services/sync.service.js';

export const syncRouter = Router();

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

// ── Validation schemas ────────────────────────────────────────────────────────

const offlineQueueItemSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido.'),
  operation: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  entityType: z.enum(['session', 'serie_log', 'food_log', 'sleep_record', 'weight']),
  entityId: z.string().uuid('entityId debe ser un UUID válido.'),
  payload: z.record(z.unknown()),
  clientTimestamp: z.number().int().positive('clientTimestamp debe ser un Unix timestamp en ms.'),
  isProcessed: z.boolean().default(false),
});

const syncPushSchema = z.object({
  items: z
    .array(offlineQueueItemSchema)
    .min(1, 'Se requiere al menos un elemento en la cola.')
    .max(500, 'No se pueden enviar más de 500 elementos por lote.'),
});

// ── POST /sync/push ───────────────────────────────────────────────────────────

/**
 * Recibir la Cola_Offline del cliente y aplicar escrituras al servidor.
 * Resuelve conflictos con política "última escritura gana" por clientTimestamp.
 * Idempotente: elementos ya procesados son ignorados.
 *
 * Body:
 *   items — array de OfflineQueueItem
 *
 * Requirements: 12.2, 12.3, 12.4
 */
syncRouter.post(
  '/push',
  asyncHandler(async (req, res) => {
    const parsed = syncPushSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    // Inject userId into each item for security (ignore client-provided userId)
    const items = parsed.data.items.map((item) => ({
      ...item,
      userId: req.userId,
    }));

    const result = await processSyncPush(req.userId, items);

    res.status(200).json(result);
  }),
);

// ── GET /sync/pull ────────────────────────────────────────────────────────────

/**
 * Obtener cambios del servidor desde un timestamp dado.
 *
 * Query params:
 *   since — Unix timestamp en ms (opcional, por defecto devuelve todo)
 *
 * Requirements: 12.3
 */
syncRouter.get(
  '/pull',
  asyncHandler(async (req, res) => {
    const sinceParam = req.query['since'];
    let since: number | undefined;

    if (sinceParam !== undefined) {
      const parsed = Number(sinceParam);
      if (isNaN(parsed) || parsed < 0) {
        res.status(400).json({
          error: 'Validation failed',
          message: 'El parámetro since debe ser un Unix timestamp en ms.',
          code: 'INVALID_SINCE',
        });
        return;
      }
      since = parsed;
    }

    const result = await processSyncPull(req.userId, since);
    res.status(200).json(result);
  }),
);

// ── GET /sync/status ──────────────────────────────────────────────────────────

/**
 * Obtener el estado de sincronización del usuario.
 * Devuelve el número de elementos pendientes y la última sincronización.
 *
 * Requirements: 12.3
 */
syncRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = await getSyncStatus(req.userId);
    res.status(200).json(status);
  }),
);
