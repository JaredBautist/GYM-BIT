/**
 * Core user and profile types shared across all packages.
 */

export type UserGoal =
  | 'LOSE_WEIGHT'
  | 'GAIN_MUSCLE'
  | 'GAIN_WEIGHT'
  | 'MAINTENANCE'
  | 'ENDURANCE';

export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface User {
  id: string;
  email: string;
  auth0Id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  emailVerified: boolean;
}

export interface Profile {
  id: string;
  userId: string;
  birthDate: Date;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  goal: UserGoal;
  experienceLevel: ExperienceLevel;
  availableDays: number;
  medicalConditions?: string;
  bmi: number;
  bmr: number;
  tdee: number;
  updatedAt: Date;
}

export interface WeightHistoryEntry {
  id: string;
  userId: string;
  weightKg: number;
  recordedAt: Date;
}
