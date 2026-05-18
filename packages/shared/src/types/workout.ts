/**
 * Workout, exercise, session and series types.
 */

export type PlanType = 'FULL_BODY' | 'PPL' | 'UPPER_LOWER' | 'CARDIO';

export type EquipmentType = 'BARBELL' | 'DUMBBELL' | 'MACHINE' | 'CABLE' | 'BODYWEIGHT' | 'OTHER';

export interface Exercise {
  id: string;
  name: string;
  muscleGroups: string[];
  equipmentType: EquipmentType;
  category: string;
  gifUrl?: string;
  videoUrl?: string;
  isCompound: boolean;
}

export interface WorkoutPlan {
  id: string;
  userId: string;
  planType: PlanType;
  isActive: boolean;
  generatedAt: Date;
  config: Record<string, unknown>;
}

export interface WorkoutDay {
  id: string;
  planId: string;
  dayOfWeek: number;
  focus: string;
}

export interface PlanExercise {
  id: string;
  dayId: string;
  exerciseId: string;
  sets: number;
  repsTarget: number;
  restSeconds: number;
  orderIndex: number;
  supersetGroupId?: string;
  weightKg: number;
}

export interface Session {
  id: string;
  userId: string;
  planId: string;
  startedAt: Date;
  completedAt?: Date;
  totalVolumeKg: number;
  durationSeconds: number;
  isActive: boolean;
  offlineState?: Record<string, unknown>;
}

export interface SerieLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  repsDone: number;
  loggedAt: Date;
  isPr: boolean;
}

export interface PersonalRecord {
  id: string;
  userId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  achievedAt: Date;
}
