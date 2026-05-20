/**
 * Wearables router — integración con dispositivos wearables.
 *
 * POST   /wearables/connect/:provider    — conectar wearable
 * DELETE /wearables/disconnect/:provider — desconectar
 * GET    /wearables/status               — estado de conexiones
 * POST   /wearables/sync                 — sincronización manual
 * GET    /wearables/data                 — datos importados
 *
 * Requirements: 10.1, 10.2, 10.3, 10.5
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import {
  connectWearable,
  disconnectWearable,
  getWearableStatus,
  importWearableData,
  getWearableData,
  type WearableProvider,
} from '../../services/wearable.service.js';

export const wearableRouter = Router();

const VALID_PROVIDERS: WearableProvider[] = ['healthkit', 'garmin', 'google_fit'];

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

const connectSchema = z.object({
  accessTokenEnc: z.string().min(1, 'accessTokenEnc es requerido.'),
  refreshTokenEnc: z.string().optional(),
  tokenExpiresAt: z.string().datetime().optional(),
});

const syncSchema = z.object({
  provider: z.enum(['healthkit', 'garmin', 'google_fit']),
  records: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.'),
      steps: z.number().int().min(0).optional(),
      caloriesBurned: z.number().min(0).optional(),
      avgHeartRate: z.number().int().min(0).optional(),
      vo2max: z.number().min(0).optional(),
      stressLevel: z.number().int().min(0).max(100).optional(),
      rawData: z.record(z.unknown()).optional(),
    }),
  ).min(1, 'Se requiere al menos un registro.'),
});

// ── POST /wearables/connect/:provider ────────────────────────────────────────

wearableRouter.post(
  '/connect/:provider',
  asyncHandler(async (req, res) => {
    const provider = req.params['provider'] as string;

    if (!VALID_PROVIDERS.includes(provider as WearableProvider)) {
      res.status(400).json({
        error: 'Validation failed',
        message: `Proveedor inválido. Proveedores válidos: ${VALID_PROVIDERS.join(', ')}.`,
        code: 'INVALID_PROVIDER',
      });
      return;
    }

    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const connection = await connectWearable(req.userId, {
      provider: provider as WearableProvider,
      accessTokenEnc: parsed.data.accessTokenEnc,
      refreshTokenEnc: parsed.data.refreshTokenEnc,
      tokenExpiresAt: parsed.data.tokenExpiresAt ? new Date(parsed.data.tokenExpiresAt) : undefined,
    });

    res.status(201).json(connection);
  }),
);

// ── DELETE /wearables/disconnect/:provider ────────────────────────────────────

wearableRouter.delete(
  '/disconnect/:provider',
  asyncHandler(async (req, res) => {
    const provider = req.params['provider'] as string;

    if (!VALID_PROVIDERS.includes(provider as WearableProvider)) {
      res.status(400).json({
        error: 'Validation failed',
        message: `Proveedor inválido. Proveedores válidos: ${VALID_PROVIDERS.join(', ')}.`,
        code: 'INVALID_PROVIDER',
      });
      return;
    }

    try {
      await disconnectWearable(req.userId, provider as WearableProvider);
      res.status(204).send();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'WEARABLE_NOT_CONNECTED') {
        res.status(404).json({
          error: 'Not found',
          message: (err as Error).message,
          code: 'WEARABLE_NOT_CONNECTED',
        });
        return;
      }
      throw err;
    }
  }),
);

// ── GET /wearables/status ─────────────────────────────────────────────────────

wearableRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = await getWearableStatus(req.userId);
    res.status(200).json(status);
  }),
);

// ── POST /wearables/sync ──────────────────────────────────────────────────────

/**
 * Sincronización manual: recibe datos del wearable y los importa.
 * Requirements: 10.2, 10.3
 */
wearableRouter.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const imported = await importWearableData(
      req.userId,
      parsed.data.provider,
      parsed.data.records,
    );

    res.status(200).json({ imported, provider: parsed.data.provider });
  }),
);

// ── GET /wearables/data ───────────────────────────────────────────────────────

wearableRouter.get(
  '/data',
  asyncHandler(async (req, res) => {
    const provider = req.query['provider'] as WearableProvider | undefined;

    if (provider && !VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({
        error: 'Validation failed',
        message: `Proveedor inválido. Proveedores válidos: ${VALID_PROVIDERS.join(', ')}.`,
        code: 'INVALID_PROVIDER',
      });
      return;
    }

    const data = await getWearableData(req.userId, provider);
    res.status(200).json(data);
  }),
);
