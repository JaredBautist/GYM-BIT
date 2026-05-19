/**
 * Property-based tests for workout routine selection.
 *
 * **Validates: Requirements 4.1, 4.6, 4.7**
 *
 * Uses fast-check to verify invariants across the full valid input space
 * for selectRoutineType and the no-equipment fallback in generateWorkoutPlan.
 */

// ── Mock external dependencies before any imports ────────────────────────────

jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    REDIS_URL: 'redis://localhost:6379',
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_CLIENT_ID: 'test-client-id',
    AUTH0_CLIENT_SECRET: 'test-client-secret',
    AUTH0_AUDIENCE: 'https://test.api',
    JWT_PRIVATE_KEY_PATH: '/tmp/test-private.pem',
    JWT_PUBLIC_KEY_PATH: '/tmp/test-public.pem',
    GEMINI_API_KEY: 'test',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
    S3_BUCKET: 'test',
    USDA_API_KEY: 'test',
    FIREBASE_SERVICE_ACCOUNT_PATH: '/tmp/firebase.json',
    ENCRYPTION_KEY: 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXQ=',
  },
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() => 'mock-key-content'),
}));

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  })),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock.access.token'),
  verify: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (p: string) => `hashed:${p}`),
  compare: jest.fn(async (p: string, h: string) => h === `hashed:${p}`),
}));

// DB pool mock — captured so individual tests can configure return values
const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
jest.mock('../db/pool', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...args),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import * as fc from 'fast-check';
import {
  selectRoutineType,
  generateWorkoutPlan,
  type PlanType,
} from '../services/workout.service';
import type { Goal, ExperienceLevel } from '../services/profile.service';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const GOALS: Goal[] = ['LOSE_WEIGHT', 'GAIN_MUSCLE', 'GAIN_WEIGHT', 'MAINTENANCE', 'ENDURANCE'];
const NON_ENDURANCE_GOALS: Goal[] = ['LOSE_WEIGHT', 'GAIN_MUSCLE', 'GAIN_WEIGHT', 'MAINTENANCE'];
const EXPERIENCE_LEVELS: ExperienceLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const PLAN_TYPES: PlanType[] = ['FULL_BODY', 'PPL', 'UPPER_LOWER', 'CARDIO'];

const anyGoal = () => fc.constantFrom(...GOALS);
const nonEnduranceGoal = () => fc.constantFrom(...NON_ENDURANCE_GOALS);
const anyExperienceLevel = () => fc.constantFrom(...EXPERIENCE_LEVELS);
const availableDays = () => fc.integer({ min: 1, max: 7 });

// ── Property 4: BEGINNER always gets FULL_BODY ────────────────────────────────

describe('Property 4 — BEGINNER always receives FULL_BODY regardless of available days', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For every non-ENDURANCE goal and every number of available days (1–7),
   * when experienceLevel = 'BEGINNER', selectRoutineType must always return
   * 'FULL_BODY'. The BEGINNER override takes precedence over the days-based
   * selection logic.
   */
  it('selectRoutineType(goal, BEGINNER, days) === FULL_BODY for all non-ENDURANCE goals and all days', () => {
    fc.assert(
      fc.property(nonEnduranceGoal(), availableDays(), (goal, days) => {
        const result = selectRoutineType(goal, 'BEGINNER', days);
        expect(result).toBe('FULL_BODY');
      }),
    );
  });
});

// ── Property 5: ENDURANCE goal always produces CARDIO ────────────────────────

describe('Property 5 — ENDURANCE goal always produces CARDIO regardless of experience or days', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For every experience level and every number of available days (1–7),
   * when goal = 'ENDURANCE', selectRoutineType must always return 'CARDIO'.
   * The ENDURANCE override takes precedence over all other factors.
   */
  it('selectRoutineType(ENDURANCE, level, days) === CARDIO for all experience levels and all days', () => {
    fc.assert(
      fc.property(anyExperienceLevel(), availableDays(), (level, days) => {
        const result = selectRoutineType('ENDURANCE', level, days);
        expect(result).toBe('CARDIO');
      }),
    );
  });
});

// ── Property 6: selectRoutineType always returns a valid PlanType ─────────────

describe('Property 6 — selectRoutineType always returns a valid PlanType', () => {
  /**
   * **Validates: Requirements 4.6, 4.7**
   *
   * For any combination of goal, experience level, and available days,
   * selectRoutineType must return one of the four known plan types.
   * This ensures the function is total and never produces an unexpected value.
   */
  it('selectRoutineType(goal, level, days) is always one of the four valid PlanTypes', () => {
    fc.assert(
      fc.property(anyGoal(), anyExperienceLevel(), availableDays(), (goal, level, days) => {
        const result = selectRoutineType(goal, level, days);
        expect(PLAN_TYPES).toContain(result);
      }),
    );
  });
});

// ── Unit test: no-equipment fallback uses bodyweight query ────────────────────

describe('No-equipment fallback — generateWorkoutPlan uses bodyweight exercises when equipment=[]', () => {
  /**
   * **Validates: Requirements 4.6, 4.7**
   *
   * When generateWorkoutPlan is called with equipment = [], the service must
   * fall back to a bodyweight-only query when the primary exercise query
   * returns no results.
   *
   * We mock `query` from `../db/pool` to:
   *   1. Return an empty array for the first exercise SELECT (no equipment match).
   *   2. Return a bodyweight exercise for the fallback SELECT.
   *   3. Return the expected rows for plan/day lookups.
   *
   * We then assert that the fallback SQL contains 'bodyweight'.
   */
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to bodyweight query when primary exercise query returns empty results', async () => {
    const userId = 'user-test-123';
    const planId = 'plan-test-456';
    const dayId = 'day-test-789';

    const bodyweightExercise = {
      id: 'ex-bw-1',
      name: 'Push-up',
      muscle_groups: '["chest"]',
      equipment_type: 'bodyweight',
      category: 'strength',
      gif_url: null,
      video_url: null,
      is_compound: 1,
    };

    // withTransaction: capture the callback and execute it with a fake connection
    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const fakeConn = { execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
      await fn(fakeConn);
    });

    // query calls inside generateWorkoutPlan:
    //   1. selectExercisesForDay — primary query returns [] (no equipment match)
    //   2. selectExercisesForDay — fallback bodyweight query returns exercises
    //   3. getActivePlan — SELECT WORKOUT_PLANS
    //   4. getActivePlan — SELECT WORKOUT_DAYS
    //   5. getActivePlan — SELECT PLAN_EXERCISES for each day
    mockQuery
      .mockResolvedValueOnce([])                    // primary exercise query → empty
      .mockResolvedValueOnce([bodyweightExercise])  // fallback bodyweight query
      .mockResolvedValueOnce([{                     // SELECT WORKOUT_PLANS
        id: planId,
        user_id: userId,
        plan_type: 'FULL_BODY',
        is_active: 1,
        generated_at: new Date(),
        config: '{}',
      }])
      .mockResolvedValueOnce([{                     // SELECT WORKOUT_DAYS
        id: dayId,
        plan_id: planId,
        day_of_week: 1,
        focus: 'Full Body',
      }])
      .mockResolvedValueOnce([]);                   // SELECT PLAN_EXERCISES → empty (ok for this test)

    await generateWorkoutPlan(userId, {
      goal: 'GAIN_MUSCLE',
      experienceLevel: 'BEGINNER',
      availableDays: 1,
      equipment: [],
    });

    // Collect all SQL strings passed to mockQuery
    const sqlCalls: string[] = mockQuery.mock.calls.map((call) => String(call[0]));

    // The fallback query must reference 'bodyweight'
    const fallbackCall = sqlCalls.find((sql) => sql.toLowerCase().includes('bodyweight'));
    expect(fallbackCall).toBeDefined();
    expect(fallbackCall!.toLowerCase()).toContain('bodyweight');
  });

  it('does NOT fall back to bodyweight when primary query returns exercises', async () => {
    const userId = 'user-test-999';
    const planId = 'plan-test-999';
    const dayId = 'day-test-999';

    const regularExercise = {
      id: 'ex-reg-1',
      name: 'Barbell Squat',
      muscle_groups: '["legs"]',
      equipment_type: 'barbell',
      category: 'strength',
      gif_url: null,
      video_url: null,
      is_compound: 1,
    };

    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const fakeConn = { execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
      await fn(fakeConn);
    });

    mockQuery
      .mockResolvedValueOnce([regularExercise])  // primary query returns results → no fallback
      .mockResolvedValueOnce([{                  // SELECT WORKOUT_PLANS
        id: planId,
        user_id: userId,
        plan_type: 'FULL_BODY',
        is_active: 1,
        generated_at: new Date(),
        config: '{}',
      }])
      .mockResolvedValueOnce([{                  // SELECT WORKOUT_DAYS
        id: dayId,
        plan_id: planId,
        day_of_week: 1,
        focus: 'Full Body',
      }])
      .mockResolvedValueOnce([]);                // SELECT PLAN_EXERCISES

    await generateWorkoutPlan(userId, {
      goal: 'GAIN_MUSCLE',
      experienceLevel: 'INTERMEDIATE',
      availableDays: 1,
      equipment: ['barbell'],
    });

    const sqlCalls: string[] = mockQuery.mock.calls.map((call) => String(call[0]));

    // Count how many times a bodyweight-specific fallback query was issued
    const bodyweightFallbackCalls = sqlCalls.filter(
      (sql) =>
        sql.toLowerCase().includes('bodyweight') &&
        sql.toLowerCase().includes('equipment_type'),
    );

    // The fallback should NOT have been triggered
    expect(bodyweightFallbackCalls).toHaveLength(0);
  });
});
