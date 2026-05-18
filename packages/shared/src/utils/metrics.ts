/**
 * Shared metric calculation utilities (Requirement 3.4, 3.5).
 * These are pure functions used by both backend and frontend.
 */

import type { Gender, ExperienceLevel } from '../types/user.js';

/** Activity multipliers for TDEE calculation (Requirement 3.5) */
export const ACTIVITY_FACTORS: Record<ExperienceLevel, number> = {
  BEGINNER: 1.375,      // Light activity (1-3 days/week)
  INTERMEDIATE: 1.55,   // Moderate activity (3-5 days/week)
  ADVANCED: 1.725,      // Active (6-7 days/week)
};

/**
 * Calculate Body Mass Index (BMI / IMC).
 * IMC = weight_kg / (height_m)²
 * Returns value rounded to 2 decimal places (Requirement 3.4).
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
}

/**
 * Calculate Basal Metabolic Rate using Mifflin-St Jeor formula (Requirement 3.5).
 *
 * Male:   BMR = 10 × weight_kg + 6.25 × height_cm − 5 × age + 5
 * Female: BMR = 10 × weight_kg + 6.25 × height_cm − 5 × age − 161
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  gender: Gender,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return gender === 'MALE' ? base + 5 : base - 161;
}

/**
 * Calculate Total Daily Energy Expenditure.
 * TDEE = BMR × activity_factor (Requirement 3.5).
 */
export function calculateTDEE(bmr: number, experienceLevel: ExperienceLevel): number {
  return Math.round(bmr * ACTIVITY_FACTORS[experienceLevel]);
}

/**
 * Calculate age in full years from a birth date.
 */
export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}
