/**
 * Profile_Service — gestión del perfil físico y cálculo de métricas.
 *
 * Responsabilidades:
 *  - CRUD del perfil de usuario (PROFILES)
 *  - Historial de peso (WEIGHT_HISTORY)
 *  - Cálculo de IMC, TMB (Mifflin-St Jeor) y TDEE
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */

import { v4 as uuidv4 } from 'uuid';

import { query, withTransaction } from '../db/pool.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type Gender = 'male' | 'female';

export type Goal =
  | 'LOSE_WEIGHT'
  | 'GAIN_MUSCLE'
  | 'GAIN_WEIGHT'
  | 'MAINTENANCE'
  | 'ENDURANCE';

export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

/**
 * Activity level keys used to look up the TDEE multiplier.
 * Maps to the five Mifflin-St Jeor activity factors.
 */
export type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHT'
  | 'MODERATE'
  | 'ACTIVE'
  | 'VERY_ACTIVE';

export interface ProfileRow {
  id: string;
  user_id: string;
  birth_date: string | Date;
  gender: string;
  height_cm: number;
  weight_kg: number;
  goal: string;
  experience_level: string | null;
  available_days: number | null;
  medical_conditions: string | null;
  bmi: number | null;
  bmr: number | null;
  tdee: number | null;
  updated_at: Date;
}

export interface WeightHistoryRow {
  id: string;
  user_id: string;
  weight_kg: number;
  recorded_at: Date;
}

export interface UpdateProfileInput {
  birth_date?: string;   // ISO date string YYYY-MM-DD
  gender?: Gender;
  height_cm?: number;
  weight_kg?: number;
  goal?: Goal;
  experience_level?: ExperienceLevel;
  available_days?: number;
  medical_conditions?: string;
}

export interface ProfileMetrics {
  bmi: number | null;
  bmr: number | null;
  tdee: number | null;
}

// ── Activity factor map ───────────────────────────────────────────────────────

/** TDEE multipliers per activity level (Mifflin-St Jeor). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

/**
 * Map experience_level stored in the DB to an ActivityLevel for TDEE.
 * BEGINNER → SEDENTARY, INTERMEDIATE → MODERATE, ADVANCED → ACTIVE.
 */
function experienceToActivityLevel(experienceLevel: string | null): ActivityLevel {
  switch (experienceLevel) {
    case 'BEGINNER':
      return 'SEDENTARY';
    case 'INTERMEDIATE':
      return 'MODERATE';
    case 'ADVANCED':
      return 'ACTIVE';
    default:
      return 'SEDENTARY';
  }
}

// ── Pure calculation functions (exported for testing) ─────────────────────────

/**
 * Calculate Body Mass Index (IMC).
 * IMC = weight_kg / (height_m)²
 * Returns the value rounded to 2 decimal places.
 * Requirement 3.4
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 100) / 100;
}

/**
 * Calculate Basal Metabolic Rate using the Mifflin-St Jeor formula.
 *
 * Male:   TMB = 10 × weight_kg + 6.25 × height_cm − 5 × age + 5
 * Female: TMB = 10 × weight_kg + 6.25 × height_cm − 5 × age − 161
 *
 * Returns the value rounded to 2 decimal places.
 * Requirement 3.5
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  gender: Gender,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const bmr = gender === 'male' ? base + 5 : base - 161;
  return Math.round(bmr * 100) / 100;
}

/**
 * Calculate Total Daily Energy Expenditure.
 * TDEE = BMR × activity_factor
 * Returns the value rounded to 2 decimal places.
 * Requirement 3.5
 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const factor = ACTIVITY_FACTORS[activityLevel];
  return Math.round(bmr * factor * 100) / 100;
}

/**
 * Compute age in full years from a birth date string (YYYY-MM-DD) or Date.
 */
export function ageFromBirthDate(birthDate: string | Date): number {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

// ── Validation helpers ────────────────────────────────────────────────────────

export interface ValidationError {
  code: string;
  message: string;
}

/**
 * Validate profile fields according to requirements 3.6, 3.7, 3.8.
 * Returns an array of validation errors (empty = valid).
 */
export function validateProfileFields(data: UpdateProfileInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Height: 100–250 cm (Requirement 3.7)
  if (data.height_cm !== undefined) {
    if (data.height_cm < 100 || data.height_cm > 250) {
      errors.push({
        code: 'INVALID_HEIGHT',
        message: 'La altura debe estar entre 100 y 250 cm.',
      });
    }
  }

  // Weight: 30–300 kg (Requirement 3.8)
  if (data.weight_kg !== undefined) {
    if (data.weight_kg < 30 || data.weight_kg > 300) {
      errors.push({
        code: 'INVALID_WEIGHT',
        message: 'El peso debe estar entre 30 y 300 kg.',
      });
    }
  }

  // Minimum age: 13 years (Requirement 3.6)
  if (data.birth_date !== undefined) {
    const age = ageFromBirthDate(data.birth_date);
    if (age < 13) {
      errors.push({
        code: 'UNDERAGE',
        message: 'El usuario debe tener al menos 13 años para registrarse.',
      });
    }
  }

  return errors;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Fetch the profile for a given user.
 * Returns null if no profile exists yet.
 * Requirement 3.1
 */
export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const rows = await query<ProfileRow>(
    'SELECT * FROM PROFILES WHERE user_id = ?',
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Create or update the profile for a user.
 * Recalculates BMI, BMR and TDEE whenever height, weight, birth_date,
 * gender or experience_level change.
 * Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8
 */
export async function updateProfile(
  userId: string,
  data: UpdateProfileInput,
): Promise<ProfileRow> {
  // Validate inputs first
  const errors = validateProfileFields(data);
  if (errors.length > 0) {
    throw Object.assign(new Error(errors[0]!.message), {
      code: errors[0]!.code,
      errors,
    });
  }

  // Fetch existing profile (may be null for first-time setup)
  const existing = await getProfile(userId);

  // Merge incoming data with existing values
  const merged = {
    birth_date: data.birth_date ?? (existing?.birth_date as string | undefined),
    gender: (data.gender ?? existing?.gender) as Gender | undefined,
    height_cm: data.height_cm ?? existing?.height_cm,
    weight_kg: data.weight_kg ?? existing?.weight_kg,
    goal: data.goal ?? existing?.goal,
    experience_level: data.experience_level ?? existing?.experience_level,
    available_days: data.available_days ?? existing?.available_days,
    medical_conditions: data.medical_conditions ?? existing?.medical_conditions,
  };

  // Recalculate metrics if we have enough data
  let bmi: number | null = existing?.bmi ?? null;
  let bmr: number | null = existing?.bmr ?? null;
  let tdee: number | null = existing?.tdee ?? null;

  if (merged.weight_kg !== undefined && merged.height_cm !== undefined) {
    bmi = calculateBMI(merged.weight_kg, merged.height_cm);
  }

  if (
    merged.weight_kg !== undefined &&
    merged.height_cm !== undefined &&
    merged.birth_date !== undefined &&
    merged.gender !== undefined
  ) {
    const age = ageFromBirthDate(merged.birth_date);
    bmr = calculateBMR(merged.weight_kg, merged.height_cm, age, merged.gender);
    const activityLevel = experienceToActivityLevel(merged.experience_level ?? null);
    tdee = calculateTDEE(bmr, activityLevel);
  }

  if (existing) {
    // UPDATE existing profile
    await query(
      `UPDATE PROFILES
       SET birth_date = ?,
           gender = ?,
           height_cm = ?,
           weight_kg = ?,
           goal = ?,
           experience_level = ?,
           available_days = ?,
           medical_conditions = ?,
           bmi = ?,
           bmr = ?,
           tdee = ?,
           updated_at = NOW()
       WHERE user_id = ?`,
      [
        merged.birth_date ?? null,
        merged.gender ?? null,
        merged.height_cm ?? null,
        merged.weight_kg ?? null,
        merged.goal ?? null,
        merged.experience_level ?? null,
        merged.available_days ?? null,
        merged.medical_conditions ?? null,
        bmi,
        bmr,
        tdee,
        userId,
      ],
    );
  } else {
    // INSERT new profile
    const id = uuidv4();
    await query(
      `INSERT INTO PROFILES
         (id, user_id, birth_date, gender, height_cm, weight_kg, goal,
          experience_level, available_days, medical_conditions, bmi, bmr, tdee, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        userId,
        merged.birth_date ?? null,
        merged.gender ?? null,
        merged.height_cm ?? null,
        merged.weight_kg ?? null,
        merged.goal ?? null,
        merged.experience_level ?? null,
        merged.available_days ?? null,
        merged.medical_conditions ?? null,
        bmi,
        bmr,
        tdee,
      ],
    );
  }

  // Return the updated profile
  const updated = await getProfile(userId);
  if (!updated) {
    throw new Error('Failed to retrieve profile after update');
  }
  return updated;
}

/**
 * Record a new weight entry for the user.
 * Inserts into WEIGHT_HISTORY, updates PROFILES.weight_kg and recalculates metrics.
 * Requirement 3.3
 */
export async function recordWeight(userId: string, weightKg: number): Promise<WeightHistoryRow> {
  // Validate weight range (Requirement 3.8)
  if (weightKg < 30 || weightKg > 300) {
    throw Object.assign(
      new Error('El peso debe estar entre 30 y 300 kg.'),
      { code: 'INVALID_WEIGHT' },
    );
  }

  const id = uuidv4();

  await withTransaction(async (conn) => {
    // Insert into weight history
    await conn.execute(
      `INSERT INTO WEIGHT_HISTORY (id, user_id, weight_kg, recorded_at)
       VALUES (?, ?, ?, NOW())`,
      [id, userId, weightKg],
    );

    // Update current weight in profile
    await conn.execute(
      'UPDATE PROFILES SET weight_kg = ?, updated_at = NOW() WHERE user_id = ?',
      [weightKg, userId],
    );
  });

  // Recalculate metrics with the new weight
  const profile = await getProfile(userId);
  if (profile && profile.height_cm && profile.birth_date && profile.gender) {
    const bmi = calculateBMI(weightKg, profile.height_cm);
    const age = ageFromBirthDate(profile.birth_date);
    const bmr = calculateBMR(weightKg, profile.height_cm, age, profile.gender as Gender);
    const activityLevel = experienceToActivityLevel(profile.experience_level);
    const tdee = calculateTDEE(bmr, activityLevel);

    await query(
      'UPDATE PROFILES SET bmi = ?, bmr = ?, tdee = ?, updated_at = NOW() WHERE user_id = ?',
      [bmi, bmr, tdee, userId],
    );
  }

  // Return the newly created weight history entry
  const rows = await query<WeightHistoryRow>(
    'SELECT * FROM WEIGHT_HISTORY WHERE id = ?',
    [id],
  );
  return rows[0]!;
}

/**
 * Fetch all weight history records for a user, ordered by date descending.
 * Requirement 3.3
 */
export async function getWeightHistory(userId: string): Promise<WeightHistoryRow[]> {
  return query<WeightHistoryRow>(
    'SELECT * FROM WEIGHT_HISTORY WHERE user_id = ? ORDER BY recorded_at DESC',
    [userId],
  );
}

/**
 * Return the current BMI, BMR and TDEE for a user.
 * Requirement 3.4, 3.5
 */
export async function getMetrics(userId: string): Promise<ProfileMetrics> {
  const profile = await getProfile(userId);
  if (!profile) {
    return { bmi: null, bmr: null, tdee: null };
  }
  return {
    bmi: profile.bmi,
    bmr: profile.bmr,
    tdee: profile.tdee,
  };
}
