/**
 * Property-based tests for Sobrecarga_Progresiva (Progressive Overload).
 *
 * **Validates: Requisito 4.4**
 *
 * Uses fast-check to verify invariants for:
 *   - Property 7: Overload is applied if and only if completion_rate = 100%
 *   - Property 8: Compound exercise increment >= isolation exercise increment
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
  calculateWeightIncrement,
  applyProgressiveOverload,
} from '../services/workout.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds the sequence of mockQuery return values needed by applyProgressiveOverload
 * for a single exercise, given a completion rate expressed as a percentage (0–100).
 *
 * The function queries:
 *   1. SELECT last completed session → returns one session row
 *   2. SELECT plan exercises (JOIN EXERCISES) → returns one exercise row
 *   3. SELECT COUNT completed sets (reps_done >= reps_target) → depends on rate
 *   4. SELECT COUNT total sets → depends on rate
 *   5. (only when 100%) UPDATE PLAN_EXERCISES weight_kg
 *
 * We model a plan with 1 exercise that has sets=3, reps_target=10.
 * For a given completionRate:
 *   - completedCount = Math.floor(3 * completionRate / 100)
 *   - totalCount     = completedCount  (we only log sets that meet target for simplicity)
 *
 * When completionRate < 100, at least one set won't meet the target, so
 * completedCount < 3 or totalCount < 3, causing applied = false.
 */
function setupMocksForCompletionRate(completionRate: number): void {
  const sets = 3;
  const repsTarget = 10;
  const exerciseId = 'ex-test-001';
  const planExerciseId = 'pe-test-001';

  // How many sets fully completed (reps_done >= reps_target)
  const completedCount = completionRate === 100 ? sets : Math.floor((sets * completionRate) / 100);
  // Total sets logged (same as completed for this model)
  const totalCount = completedCount;

  // 1. Last completed session
  mockQuery.mockResolvedValueOnce([
    {
      id: 'session-prev-001',
      user_id: 'user-test',
      plan_id: 'plan-test',
      started_at: new Date(Date.now() - 7200_000),
      completed_at: new Date(Date.now() - 3600_000),
      total_volume_kg: 900,
      duration_seconds: 3600,
      is_active: 0,
      offline_state: null,
    },
  ]);

  // 2. Plan exercises with is_compound info
  mockQuery.mockResolvedValueOnce([
    {
      id: planExerciseId,
      exercise_id: exerciseId,
      sets,
      reps_target: repsTarget,
      weight_kg: 60,
      is_compound: 0, // isolation for this test
    },
  ]);

  // 3. COUNT completed sets (reps_done >= reps_target)
  mockQuery.mockResolvedValueOnce([{ completed_count: completedCount }]);

  // 4. COUNT total sets logged
  mockQuery.mockResolvedValueOnce([{ total_count: totalCount }]);

  // 5. UPDATE (only reached when 100% complete)
  if (completionRate === 100) {
    mockQuery.mockResolvedValueOnce([]); // UPDATE PLAN_EXERCISES
  }
}

// ── beforeEach: reset all mocks ───────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 7 — Overload applied if and only if completion_rate = 100%
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 7 — Overload applied if and only if completion_rate = 100%', () => {
  /**
   * **Validates: Requisito 4.4**
   *
   * For any completion_rate in [0, 99], applyProgressiveOverload must return
   * { applied: false }. Only when completion_rate = 100 must it return
   * { applied: true }.
   *
   * We test both directions:
   *   a) rate < 100  → applied = false
   *   b) rate = 100  → applied = true
   */

  it('does NOT apply overload when completion_rate < 100 (for all rates in [0, 99])', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 99 }),
        async (rate) => {
          jest.clearAllMocks();
          setupMocksForCompletionRate(rate);

          const result = await applyProgressiveOverload('user-test', 'plan-test');

          expect(result.applied).toBe(false);
          expect(result.updatedExercises).toBe(0);
        },
      ),
    );
  });

  it('DOES apply overload when completion_rate = 100', async () => {
    setupMocksForCompletionRate(100);

    const result = await applyProgressiveOverload('user-test', 'plan-test');

    expect(result.applied).toBe(true);
    expect(result.updatedExercises).toBeGreaterThan(0);
  });

  it('returns applied=false when there is no previous session', async () => {
    // No previous session → empty array
    mockQuery.mockResolvedValueOnce([]);

    const result = await applyProgressiveOverload('user-no-history', 'plan-test');

    expect(result.applied).toBe(false);
    expect(result.updatedExercises).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 8 — Compound increment >= isolation increment
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 8 — Compound exercise receives increment >= isolation exercise', () => {
  /**
   * **Validates: Requisito 4.4**
   *
   * For any boolean value of isCompound:
   *   calculateWeightIncrement(true) >= calculateWeightIncrement(false)
   *
   * This is a pure function property — no DB mocking needed.
   */

  it('calculateWeightIncrement(true) >= calculateWeightIncrement(false) for all boolean inputs', () => {
    fc.assert(
      fc.property(fc.boolean(), (_isCompound) => {
        const compoundIncrement = calculateWeightIncrement(true);
        const isolationIncrement = calculateWeightIncrement(false);

        expect(compoundIncrement).toBeGreaterThanOrEqual(isolationIncrement);
      }),
    );
  });

  it('compound increment is exactly 5.0 kg', () => {
    expect(calculateWeightIncrement(true)).toBe(5.0);
  });

  it('isolation increment is exactly 2.5 kg', () => {
    expect(calculateWeightIncrement(false)).toBe(2.5);
  });

  it('compound increment is strictly greater than isolation increment', () => {
    expect(calculateWeightIncrement(true)).toBeGreaterThan(calculateWeightIncrement(false));
  });
});
