/**
 * Notification_Service — envío y gestión de notificaciones inteligentes.
 *
 * Responsabilidades:
 *  - Gestión de configuración de notificaciones por tipo (NOTIFICATION_SETTINGS)
 *  - Lógica de envío: recordatorio entrenamiento, hidratación, comida, PR, logro, recuperación, pesaje
 *  - Supresión en modo No Molestar del SO
 *  - Regla: si no hay comida registrada antes de las 14:00 → enviar recordatorio
 *  - Integración con Google Calendar / Apple Calendar
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import { v4 as uuidv4 } from 'uuid';

import { query } from '../db/pool.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'WORKOUT_REMINDER'
  | 'HYDRATION_REMINDER'
  | 'MEAL_REMINDER'
  | 'PR_ALERT'
  | 'ACHIEVEMENT_ALERT'
  | 'LOW_RECOVERY_ALERT'
  | 'WEIGH_IN_REMINDER';

export interface NotificationSettingRow {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  is_enabled: boolean | number;
  scheduled_time: string | null;
  config: string | Record<string, unknown> | null;
}

export interface UpdateNotificationSettingInput {
  notificationType: NotificationType;
  isEnabled: boolean;
  scheduledTime?: string | undefined;
  config?: Record<string, unknown> | undefined;
}

export interface CalendarConnectionRow {
  id: string;
  user_id: string;
  provider: 'google' | 'apple';
  access_token_enc: string;
  is_active: boolean | number;
}

// ── Pure helper functions (exported for testing) ──────────────────────────────

/**
 * Determine if a meal reminder should be sent.
 * Rule: if no meal has been logged before 14:00 local time, send reminder.
 *
 * Requirements: 11.5
 */
export function shouldSendMealReminder(
  currentHour: number,
  mealsLoggedToday: number,
): boolean {
  return currentHour >= 14 && mealsLoggedToday === 0;
}

/**
 * Determine if a notification should be suppressed due to Do Not Disturb mode.
 * Non-urgent notifications are suppressed when DND is active.
 * Only PR_ALERT and ACHIEVEMENT_ALERT are considered urgent.
 *
 * Requirements: 11.3
 */
export function shouldSuppressNotification(
  notificationType: NotificationType,
  isDoNotDisturb: boolean,
): boolean {
  if (!isDoNotDisturb) return false;

  const urgentTypes: NotificationType[] = ['PR_ALERT', 'ACHIEVEMENT_ALERT'];
  return !urgentTypes.includes(notificationType);
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Get all notification settings for a user.
 * Creates default settings for any missing notification types.
 *
 * Requirements: 11.1, 11.2
 */
export async function getNotificationSettings(
  userId: string,
): Promise<NotificationSettingRow[]> {
  const existing = await query<NotificationSettingRow>(
    'SELECT * FROM notification_settings WHERE user_id = ? ORDER BY notification_type',
    [userId],
  );

  // Ensure all notification types have a setting row
  const allTypes: NotificationType[] = [
    'WORKOUT_REMINDER',
    'HYDRATION_REMINDER',
    'MEAL_REMINDER',
    'PR_ALERT',
    'ACHIEVEMENT_ALERT',
    'LOW_RECOVERY_ALERT',
    'WEIGH_IN_REMINDER',
  ];

  const existingTypes = new Set(existing.map((s) => s.notification_type));
  const missingTypes = allTypes.filter((t) => !existingTypes.has(t));

  if (missingTypes.length > 0) {
    for (const notificationType of missingTypes) {
      await query(
        `INSERT INTO notification_settings (id, user_id, notification_type, is_enabled, scheduled_time, config)
         VALUES (?, ?, ?, TRUE, NULL, NULL)`,
        [uuidv4(), userId, notificationType],
      );
    }

    return query<NotificationSettingRow>(
      'SELECT * FROM notification_settings WHERE user_id = ? ORDER BY notification_type',
      [userId],
    );
  }

  return existing;
}

/**
 * Update a notification setting for a user.
 * Creates the setting if it doesn't exist.
 *
 * Requirements: 11.2
 */
export async function updateNotificationSetting(
  userId: string,
  input: UpdateNotificationSettingInput,
): Promise<NotificationSettingRow> {
  const { notificationType, isEnabled, scheduledTime, config } = input;

  const existing = await query<NotificationSettingRow>(
    'SELECT * FROM notification_settings WHERE user_id = ? AND notification_type = ? LIMIT 1',
    [userId, notificationType],
  );

  if (existing.length > 0) {
    await query(
      `UPDATE notification_settings
       SET is_enabled = ?, scheduled_time = ?, config = ?
       WHERE user_id = ? AND notification_type = ?`,
      [
        isEnabled,
        scheduledTime ?? null,
        config ? JSON.stringify(config) : null,
        userId,
        notificationType,
      ],
    );
  } else {
    await query(
      `INSERT INTO notification_settings (id, user_id, notification_type, is_enabled, scheduled_time, config)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        userId,
        notificationType,
        isEnabled,
        scheduledTime ?? null,
        config ? JSON.stringify(config) : null,
      ],
    );
  }

  const rows = await query<NotificationSettingRow>(
    'SELECT * FROM notification_settings WHERE user_id = ? AND notification_type = ? LIMIT 1',
    [userId, notificationType],
  );

  return rows[0]!;
}

/**
 * Check if a meal reminder should be sent for a user today.
 * Returns true if no meals have been logged before 14:00.
 *
 * Requirements: 11.5
 */
export async function checkMealReminderNeeded(userId: string): Promise<boolean> {
  const currentHour = new Date().getHours();

  // Only check after 14:00
  if (currentHour < 14) return false;

  // Check if the user has the meal reminder enabled
  const settings = await query<NotificationSettingRow>(
    `SELECT * FROM notification_settings
     WHERE user_id = ? AND notification_type = 'MEAL_REMINDER' AND is_enabled = TRUE
     LIMIT 1`,
    [userId],
  );

  if (settings.length === 0) return false;

  // Count meals logged today
  const today = new Date().toISOString().split('T')[0]!;
  const mealsRows = await query<{ meal_count: number }>(
    `SELECT COUNT(*) AS meal_count
     FROM meals m
     JOIN daily_records dr ON m.daily_record_id = dr.id
     WHERE dr.user_id = ? AND dr.record_date = ?`,
    [userId, today],
  );

  const mealsLoggedToday = mealsRows[0]?.meal_count ?? 0;
  return shouldSendMealReminder(currentHour, mealsLoggedToday);
}

/**
 * Connect a calendar provider (Google Calendar or Apple Calendar) for the user.
 *
 * Requirements: 11.4
 */
export async function connectCalendar(
  userId: string,
  provider: 'google' | 'apple',
  accessTokenEnc: string,
): Promise<CalendarConnectionRow> {
  // Check if connection already exists
  const existing = await query<CalendarConnectionRow>(
    'SELECT * FROM calendar_connections WHERE user_id = ? AND provider = ? LIMIT 1',
    [userId, provider],
  );

  if (existing.length > 0) {
    await query(
      `UPDATE calendar_connections
       SET access_token_enc = ?, is_active = TRUE
       WHERE user_id = ? AND provider = ?`,
      [accessTokenEnc, userId, provider],
    );
  } else {
    const id = uuidv4();
    await query(
      `INSERT INTO calendar_connections (id, user_id, provider, access_token_enc, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [id, userId, provider, accessTokenEnc],
    );
  }

  const rows = await query<CalendarConnectionRow>(
    'SELECT * FROM calendar_connections WHERE user_id = ? AND provider = ? LIMIT 1',
    [userId, provider],
  );

  return rows[0]!;
}
