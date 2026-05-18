import { z } from 'zod';

/** Minimum age in years (Requirement 3.6) */
const MIN_AGE_YEARS = 13;

function minBirthDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE_YEARS);
  return d;
}

export const profileSchema = z.object({
  name: z.string().min(1).max(100),
  birthDate: z
    .coerce.date()
    .max(minBirthDate(), { message: `User must be at least ${MIN_AGE_YEARS} years old` }),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  /** Height in centimetres — valid range 100–250 cm (Requirement 3.7) */
  heightCm: z.number().min(100, 'Height must be at least 100 cm').max(250, 'Height must be at most 250 cm'),
  /** Weight in kilograms — valid range 30–300 kg (Requirement 3.8) */
  weightKg: z.number().min(30, 'Weight must be at least 30 kg').max(300, 'Weight must be at most 300 kg'),
  goal: z.enum(['LOSE_WEIGHT', 'GAIN_MUSCLE', 'GAIN_WEIGHT', 'MAINTENANCE', 'ENDURANCE']),
  experienceLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  availableDays: z.number().int().min(1).max(7),
  medicalConditions: z.string().max(1000).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const weightUpdateSchema = z.object({
  weightKg: z.number().min(30, 'Weight must be at least 30 kg').max(300, 'Weight must be at most 300 kg'),
});

export type WeightUpdateInput = z.infer<typeof weightUpdateSchema>;
