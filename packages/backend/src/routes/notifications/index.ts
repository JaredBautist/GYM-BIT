/**
 * Notifications router — configuración y gestión de notificaciones.
 *
 * GET  /notifications/settings         — configuración actual
 * PUT  /notifications/settings         — actualizar configuración
 * POST /notifications/calendar/connect — conectar calendario
 *
 * Requirements: 11.1, 11.2, 11.4
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import {
  getNotificationSettings,
  updateNotificationSetting,
  connectCalendar,
  type NotificationType,
} from '../../services/notification.service.js';

export const notificationRouter = Router();

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

const updateSettingSchema = z.object({
  notificationType: z.enum([
    'WORKOUT_REMINDER',
    'HYDRATION_REMINDER',
    'MEAL_REMINDER',
    'PR_ALERT',
    'ACHIEVEMENT_ALERT',
    'LOW_RECOVERY_ALERT',
    'WEIGH_IN_REMINDER',
  ]),
  isEnabled: z.boolean(),
  scheduledTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'scheduledTime debe tener formato HH:MM.')
    .optional(),
  config: z.record(z.unknown()).optional(),
});

const calendarConnectSchema = z.object({
  provider: z.enum(['google', 'apple']),
  accessTokenEnc: z.string().min(1, 'accessTokenEnc es requerido.'),
});

// ── GET /notifications/settings ───────────────────────────────────────────────

/**
 * Obtener la configuración de notificaciones del usuario.
 * Crea configuraciones por defecto para los tipos que no existan.
 * Requirements: 11.1, 11.2
 */
notificationRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await getNotificationSettings(req.userId);
    res.status(200).json(settings);
  }),
);

// ── PUT /notifications/settings ───────────────────────────────────────────────

/**
 * Actualizar la configuración de un tipo de notificación.
 * Requirements: 11.2
 */
notificationRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const parsed = updateSettingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const setting = await updateNotificationSetting(req.userId, {
      notificationType: parsed.data.notificationType as NotificationType,
      isEnabled: parsed.data.isEnabled,
      scheduledTime: parsed.data.scheduledTime,
      config: parsed.data.config as Record<string, unknown> | undefined,
    });

    res.status(200).json(setting);
  }),
);

// ── POST /notifications/calendar/connect ─────────────────────────────────────

/**
 * Conectar Google Calendar o Apple Calendar.
 * Requirements: 11.4
 */
notificationRouter.post(
  '/calendar/connect',
  asyncHandler(async (req, res) => {
    const parsed = calendarConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const connection = await connectCalendar(
      req.userId,
      parsed.data.provider,
      parsed.data.accessTokenEnc,
    );

    res.status(201).json(connection);
  }),
);
