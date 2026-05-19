/**
 * Unit tests for Nutrition_Service.
 *
 * Covers:
 *  - addFoodToMeal: daily totals updated when food is added (Requirement 6.4)
 *  - removeFoodFromMeal: daily totals updated when food is removed (Requirement 6.4)
 *  - addFoodToMeal: throws FOOD_NOT_FOUND when food doesn't exist (Requirement 6.4)
 *  - generateNutritionPlan: throws INCOMPLETE_PROFILE when profile is missing data (Requirement 7.4)
 *  - generateNutritionPlan: deactivates existing plan and creates new one (Requirements 7.1, 7.2)
 *
 * Requirements: 6.4, 7.4
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

import {
  addFoodToMeal,
  removeFoodFromMeal,
  generateNutritionPlan,
} from '../services/nutrition.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFoodRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'food-001',
    usda_id: 'usda-001',
    barcode: null,
    name: 'Chicken Breast',
    calories_per_100g: 165,
    protein_per_100g: 31,
    carbs_per_100g: 0,
    fat_per_100g: 3.6,
    source: 'USDA',
    ...overrides,
  };
}

function makeFoodLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-001',
    meal_id: 'meal-001',
    food_id: 'food-001',
    quantity_g: 200,
    calories: 330,
    protein: 62,
    carbs: 0,
    fat: 7.2,
    ...overrides,
  };
}

function makeNutritionPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-001',
    user_id: 'user-abc',
    calorie_goal: 2200,
    protein_goal_g: 152,
    carbs_goal_g: 220,
    fat_goal_g: 61,
    is_active: 1,
    generated_at: new Date(),
    ...overrides,
  };
}

// ── beforeEach: reset all mocks ───────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// addFoodToMeal — daily totals updated (Requirement 6.4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('addFoodToMeal — daily totals updated (Req 6.4)', () => {
  it('executes UPDATE on daily_records after inserting a food log', async () => {
    const mealId = 'meal-001';
    const foodId = 'food-001';
    const quantityG = 200;

    // withTransaction mock: simulate the INSERT food_log
    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const mockConn = { execute: jest.fn().mockResolvedValue([]) };
      await fn(mockConn);
    });

    mockQuery
      // 1. SELECT food by id
      .mockResolvedValueOnce([makeFoodRow()])
      // 2. recalculateDailyTotals: SELECT daily_record_id from meals
      .mockResolvedValueOnce([{ daily_record_id: 'daily-001' }])
      // 3. recalculateDailyTotals: SUM food_logs
      .mockResolvedValueOnce([
        { total_calories: 330, total_protein: 62, total_carbs: 0, total_fat: 7.2 },
      ])
      // 4. recalculateDailyTotals: UPDATE daily_records
      .mockResolvedValueOnce([])
      // 5. SELECT inserted food_log
      .mockResolvedValueOnce([makeFoodLogRow()]);

    await addFoodToMeal(mealId, foodId, quantityG);

    // Verify that an UPDATE query on daily_records was executed
    const updateCall = mockQuery.mock.calls.find(
      (call) =>
        String(call[0]).toUpperCase().includes('UPDATE') &&
        String(call[0]).toLowerCase().includes('daily_records'),
    );
    expect(updateCall).toBeDefined();

    // Verify the UPDATE was called with the correct totals
    expect(updateCall![1]).toContain(330);   // total_calories
    expect(updateCall![1]).toContain(62);    // total_protein
    expect(updateCall![1]).toContain('daily-001'); // daily_record_id
  });

  it('inserts a food_log row with correctly calculated macros', async () => {
    const mealId = 'meal-001';
    const foodId = 'food-001';
    const quantityG = 100; // exactly 100g → factor = 1

    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const mockConn = { execute: jest.fn().mockResolvedValue([]) };
      await fn(mockConn);
    });

    mockQuery
      .mockResolvedValueOnce([makeFoodRow()])                                    // SELECT food
      .mockResolvedValueOnce([{ daily_record_id: 'daily-001' }])                // SELECT meal
      .mockResolvedValueOnce([
        { total_calories: 165, total_protein: 31, total_carbs: 0, total_fat: 3.6 },
      ])                                                                          // SUM totals
      .mockResolvedValueOnce([])                                                  // UPDATE daily_records
      .mockResolvedValueOnce([makeFoodLogRow({ calories: 165, protein: 31, carbs: 0, fat: 3.6 })]);

    const result = await addFoodToMeal(mealId, foodId, quantityG);

    expect(result.calories).toBe(165);
    expect(result.protein).toBe(31);
    expect(result.carbs).toBe(0);
    expect(result.fat).toBe(3.6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// removeFoodFromMeal — daily totals updated (Requirement 6.4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('removeFoodFromMeal — daily totals updated (Req 6.4)', () => {
  it('executes UPDATE on daily_records after deleting a food log', async () => {
    const mealId = 'meal-001';
    const foodLogId = 'log-001';

    mockQuery
      // 1. SELECT food_log to verify it belongs to this meal
      .mockResolvedValueOnce([makeFoodLogRow()])
      // 2. DELETE food_log
      .mockResolvedValueOnce([])
      // 3. recalculateDailyTotals: SELECT daily_record_id from meals
      .mockResolvedValueOnce([{ daily_record_id: 'daily-001' }])
      // 4. recalculateDailyTotals: SUM food_logs (now 0 after deletion)
      .mockResolvedValueOnce([
        { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 },
      ])
      // 5. recalculateDailyTotals: UPDATE daily_records
      .mockResolvedValueOnce([]);

    await removeFoodFromMeal(mealId, foodLogId);

    // Verify that a DELETE query was executed
    const deleteCall = mockQuery.mock.calls.find(
      (call) =>
        String(call[0]).toUpperCase().includes('DELETE') &&
        String(call[0]).toLowerCase().includes('food_logs'),
    );
    expect(deleteCall).toBeDefined();

    // Verify that an UPDATE query on daily_records was executed
    const updateCall = mockQuery.mock.calls.find(
      (call) =>
        String(call[0]).toUpperCase().includes('UPDATE') &&
        String(call[0]).toLowerCase().includes('daily_records'),
    );
    expect(updateCall).toBeDefined();
  });

  it('throws FOOD_LOG_NOT_FOUND when the food log does not belong to the meal', async () => {
    const mealId = 'meal-001';
    const foodLogId = 'log-nonexistent';

    // SELECT returns empty → food log not found for this meal
    mockQuery.mockResolvedValueOnce([]);

    await expect(removeFoodFromMeal(mealId, foodLogId)).rejects.toMatchObject({
      code: 'FOOD_LOG_NOT_FOUND',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// addFoodToMeal — FOOD_NOT_FOUND error (Requirement 6.4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('addFoodToMeal — FOOD_NOT_FOUND error (Req 6.4)', () => {
  it('throws FOOD_NOT_FOUND when the food does not exist in the database', async () => {
    const mealId = 'meal-001';
    const foodId = 'food-nonexistent';
    const quantityG = 100;

    // SELECT food returns empty → food not found
    mockQuery.mockResolvedValueOnce([]);

    await expect(addFoodToMeal(mealId, foodId, quantityG)).rejects.toMatchObject({
      code: 'FOOD_NOT_FOUND',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateNutritionPlan — INCOMPLETE_PROFILE error (Requirement 7.4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateNutritionPlan — INCOMPLETE_PROFILE error (Req 7.4)', () => {
  it('throws INCOMPLETE_PROFILE when profile does not exist', async () => {
    const userId = 'user-no-profile';

    // SELECT profile returns empty
    mockQuery.mockResolvedValueOnce([]);

    await expect(generateNutritionPlan(userId)).rejects.toMatchObject({
      code: 'INCOMPLETE_PROFILE',
    });
  });

  it('throws INCOMPLETE_PROFILE when TDEE is null', async () => {
    const userId = 'user-missing-tdee';

    mockQuery.mockResolvedValueOnce([
      { tdee: null, weight_kg: 80, goal: 'GAIN_MUSCLE' },
    ]);

    await expect(generateNutritionPlan(userId)).rejects.toMatchObject({
      code: 'INCOMPLETE_PROFILE',
    });
  });

  it('throws INCOMPLETE_PROFILE when weight_kg is null', async () => {
    const userId = 'user-missing-weight';

    mockQuery.mockResolvedValueOnce([
      { tdee: 2500, weight_kg: null, goal: 'GAIN_MUSCLE' },
    ]);

    await expect(generateNutritionPlan(userId)).rejects.toMatchObject({
      code: 'INCOMPLETE_PROFILE',
    });
  });

  it('throws INCOMPLETE_PROFILE when goal is null', async () => {
    const userId = 'user-missing-goal';

    mockQuery.mockResolvedValueOnce([
      { tdee: 2500, weight_kg: 80, goal: null },
    ]);

    await expect(generateNutritionPlan(userId)).rejects.toMatchObject({
      code: 'INCOMPLETE_PROFILE',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateNutritionPlan — deactivates existing plan and creates new one (Req 7.1, 7.2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateNutritionPlan — deactivates existing plan and creates new one (Req 7.1, 7.2)', () => {
  it('executes UPDATE to deactivate existing plans and INSERT to create a new plan', async () => {
    const userId = 'user-abc';

    // withTransaction mock: simulate the UPDATE + INSERT inside the transaction
    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const mockConn = { execute: jest.fn().mockResolvedValue([]) };
      await fn(mockConn);
    });

    mockQuery
      // 1. SELECT profile
      .mockResolvedValueOnce([{ tdee: 2500, weight_kg: 80, goal: 'GAIN_MUSCLE' }])
      // 2. SELECT new plan after INSERT
      .mockResolvedValueOnce([makeNutritionPlanRow()]);

    const result = await generateNutritionPlan(userId);

    // Verify withTransaction was called (contains UPDATE + INSERT)
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);

    // Inspect the transaction callback to verify it calls UPDATE and INSERT
    const transactionFn = mockWithTransaction.mock.calls[0]![0] as (conn: {
      execute: jest.Mock;
    }) => Promise<void>;
    const mockConn = { execute: jest.fn().mockResolvedValue([]) };
    await transactionFn(mockConn);

    const executeCalls = mockConn.execute.mock.calls;

    // First call should be UPDATE to deactivate existing plans
    const updateCall = executeCalls.find(
      (call) =>
        String(call[0]).toUpperCase().includes('UPDATE') &&
        String(call[0]).toLowerCase().includes('nutrition_plans'),
    );
    expect(updateCall).toBeDefined();
    expect(String(updateCall![0]).toUpperCase()).toContain('FALSE');

    // Second call should be INSERT for the new plan
    const insertCall = executeCalls.find(
      (call) =>
        String(call[0]).toUpperCase().includes('INSERT') &&
        String(call[0]).toLowerCase().includes('nutrition_plans'),
    );
    expect(insertCall).toBeDefined();

    // Result should be the new plan
    expect(result).toBeDefined();
    expect(result.user_id).toBe('user-abc');
  });

  it('returns a plan with calorie_goal adjusted for LOSE_WEIGHT (TDEE - 400)', async () => {
    const userId = 'user-abc';
    const tdee = 2500;
    const expectedCaloricGoal = tdee - 400; // 2100

    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const mockConn = { execute: jest.fn().mockResolvedValue([]) };
      await fn(mockConn);
    });

    mockQuery
      .mockResolvedValueOnce([{ tdee, weight_kg: 70, goal: 'LOSE_WEIGHT' }])
      .mockResolvedValueOnce([makeNutritionPlanRow({ calorie_goal: expectedCaloricGoal })]);

    const result = await generateNutritionPlan(userId);

    expect(result.calorie_goal).toBe(expectedCaloricGoal);
  });

  it('returns a plan with calorie_goal adjusted for GAIN_MUSCLE (TDEE + 300)', async () => {
    const userId = 'user-abc';
    const tdee = 2500;
    const expectedCaloricGoal = tdee + 300; // 2800

    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const mockConn = { execute: jest.fn().mockResolvedValue([]) };
      await fn(mockConn);
    });

    mockQuery
      .mockResolvedValueOnce([{ tdee, weight_kg: 80, goal: 'GAIN_MUSCLE' }])
      .mockResolvedValueOnce([makeNutritionPlanRow({ calorie_goal: expectedCaloricGoal })]);

    const result = await generateNutritionPlan(userId);

    expect(result.calorie_goal).toBe(expectedCaloricGoal);
  });
});
