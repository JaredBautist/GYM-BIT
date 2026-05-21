/**
 * Repositorio de usuario y perfil en SQLite local.
 * Gestiona la caché de sesión cifrada con AES-256 (expo-secure-store).
 *
 * Requirements: 1.8, 12.1, 13.1
 */

import * as SecureStore from 'expo-secure-store';

import { dbQuery, dbRun } from '../database.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalUser {
  id: string;
  email: string;
  name: string;
  auth0Id: string | null;
  isActive: number;
  emailVerified: number;
  birthDate: string | null;
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: string | null;
  experienceLevel: string | null;
  availableDays: number | null;
  medicalConditions: string | null;
  bmi: number | null;
  bmr: number | null;
  tdee: number | null;
  updatedAt: number;
}

// ── Secure session storage keys ───────────────────────────────────────────────

const ACCESS_TOKEN_KEY = 'gymbit_access_token';
const REFRESH_TOKEN_KEY = 'gymbit_refresh_token';
const USER_ID_KEY = 'gymbit_user_id';

// ── Session persistence (AES-256 via expo-secure-store) ───────────────────────

/**
 * Persiste la sesión del usuario de forma segura.
 * expo-secure-store usa AES-256 en Android (Keystore) y Keychain en iOS.
 *
 * Requirements: 1.8, 13.1
 */
export async function saveSession(
  userId: string,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(USER_ID_KEY, userId),
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

/**
 * Recupera la sesión almacenada localmente.
 * Permite acceso offline sin re-autenticación (Requisito 1.8).
 */
export async function getSession(): Promise<{
  userId: string;
  accessToken: string;
  refreshToken: string;
} | null> {
  const [userId, accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(USER_ID_KEY),
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);

  if (!userId || !accessToken || !refreshToken) return null;

  return { userId, accessToken, refreshToken };
}

/**
 * Elimina la sesión almacenada localmente (logout).
 */
export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(USER_ID_KEY),
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

// ── User cache CRUD ───────────────────────────────────────────────────────────

/**
 * Guarda o actualiza el usuario en la caché local.
 */
export async function upsertUser(user: Omit<LocalUser, 'updatedAt'>): Promise<void> {
  await dbRun(
    `INSERT INTO users_cache
       (id, email, name, auth0_id, is_active, email_verified,
        birth_date, gender, height_cm, weight_kg, goal,
        experience_level, available_days, medical_conditions,
        bmi, bmr, tdee, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       auth0_id = excluded.auth0_id,
       is_active = excluded.is_active,
       email_verified = excluded.email_verified,
       birth_date = excluded.birth_date,
       gender = excluded.gender,
       height_cm = excluded.height_cm,
       weight_kg = excluded.weight_kg,
       goal = excluded.goal,
       experience_level = excluded.experience_level,
       available_days = excluded.available_days,
       medical_conditions = excluded.medical_conditions,
       bmi = excluded.bmi,
       bmr = excluded.bmr,
       tdee = excluded.tdee,
       updated_at = excluded.updated_at`,
    [
      user.id,
      user.email,
      user.name,
      user.auth0Id,
      user.isActive,
      user.emailVerified,
      user.birthDate,
      user.gender,
      user.heightCm,
      user.weightKg,
      user.goal,
      user.experienceLevel,
      user.availableDays,
      user.medicalConditions,
      user.bmi,
      user.bmr,
      user.tdee,
      Date.now(),
    ],
  );
}

/**
 * Obtiene el usuario de la caché local por ID.
 */
export async function getUserById(userId: string): Promise<LocalUser | null> {
  const rows = await dbQuery<LocalUser>(
    'SELECT * FROM users_cache WHERE id = ? LIMIT 1',
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Elimina todos los datos del usuario de la caché local (GDPR).
 */
export async function clearUserCache(userId: string): Promise<void> {
  await dbRun('DELETE FROM users_cache WHERE id = ?', [userId]);
}
