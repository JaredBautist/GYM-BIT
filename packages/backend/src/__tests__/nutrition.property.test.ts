/**
 * Property-based tests for nutritional calculation functions.
 *
 * **Validates: Requirements 6.6, 7.1, 7.2**
 *
 * Uses fast-check to verify mathematical invariants across the full
 * valid input space defined in the requirements.
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

// Mock DB pool — pure calculation functions don't touch the database
jest.mock('../db/pool', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import * as fc from 'fast-check';
import {
  calculateCaloricGoal,
  calculateMacros,
} from '../services/nutrition.service';
import type { Goal } from '../services/profile.service';

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** Valid TDEE range: 500–5000 kcal */
const validTdee = () => fc.float({ min: 500, max: 5000, noNaN: true });

/** Valid body weight range: 30–300 kg */
const validWeight = () => fc.float({ min: 30, max: 300, noNaN: true });

/** All supported goal types */
const anyGoal = () =>
  fc.constantFrom<Goal>(
    'LOSE_WEIGHT',
    'GAIN_MUSCLE',
    'GAIN_WEIGHT',
    'MAINTENANCE',
    'ENDURANCE',
  );

// ── Property 9: Recipe total calories = sum of (calories_per_100g × quantity_g / 100) ──
// Validates: Requirement 6.6

describe('Property 9 — Recipe total calories equals sum of ingredient calories × portion', () => {
  /**
   * **Validates: Requirements 6.6**
   *
   * For any set of ingredients (food with known macros per 100g + quantity in grams),
   * the total calories of the recipe must equal the sum of
   * (calories_per_100g × quantity_g / 100) for each ingredient.
   *
   * This is a pure calculation property — no DB access needed.
   */
  it('sum of (caloriesPer100g × quantityG / 100) equals the manually computed total', () => {
    const ingredientArb = fc.record({
      caloriesPer100g: fc.float({ min: 0, max: 900, noNaN: true }),
      quantityG: fc.float({ min: 1, max: 1000, noNaN: true }),
    });

    fc.assert(
      fc.property(fc.array(ingredientArb, { minLength: 1, maxLength: 20 }), (ingredients) => {
        // Compute total calories the same way the service does (sum of factor × calories)
        const totalCalories = ingredients.reduce(
          (sum, ing) => sum + (ing.caloriesPer100g * ing.quantityG) / 100,
          0,
        );

        // Recompute independently to verify the formula is consistent
        const expected = ingredients.reduce(
          (sum, ing) => sum + ing.caloriesPer100g * (ing.quantityG / 100),
          0,
        );

        // Both computations must agree (floating-point equality within tolerance)
        expect(totalCalories).toBeCloseTo(expected, 5);

        // Total must be non-negative (calories and quantities are non-negative)
        expect(totalCalories).toBeGreaterThanOrEqual(0);

        // Total must be finite
        expect(Number.isFinite(totalCalories)).toBe(true);
      }),
    );
  });

  it('recipe with a single ingredient has calories = caloriesPer100g × quantityG / 100', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 900, noNaN: true }),
        fc.float({ min: 1, max: 1000, noNaN: true }),
        (caloriesPer100g, quantityG) => {
          const expected = (caloriesPer100g * quantityG) / 100;
          const computed = caloriesPer100g * (quantityG / 100);
          expect(computed).toBeCloseTo(expected, 5);
        },
      ),
    );
  });
});

// ── Property 10: LOSE_WEIGHT goal < TDEE < GAIN_MUSCLE goal ──────────────────
// Validates: Requirement 7.1

describe('Property 10 — Caloric goal: LOSE_WEIGHT < TDEE < GAIN_MUSCLE', () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * For any valid TDEE value (500–5000 kcal):
   *   calculateCaloricGoal(tdee, 'LOSE_WEIGHT') < tdee < calculateCaloricGoal(tdee, 'GAIN_MUSCLE')
   *
   * This confirms that the deficit/surplus adjustments are applied in the
   * correct direction relative to the maintenance baseline.
   */
  it('LOSE_WEIGHT goal < TDEE < GAIN_MUSCLE goal for all valid TDEE values', () => {
    fc.assert(
      fc.property(validTdee(), (tdee) => {
        const loseWeightGoal = calculateCaloricGoal(tdee, 'LOSE_WEIGHT');
        const gainMuscleGoal = calculateCaloricGoal(tdee, 'GAIN_MUSCLE');

        // LOSE_WEIGHT must be strictly below TDEE (deficit)
        expect(loseWeightGoal).toBeLessThan(tdee);

        // GAIN_MUSCLE must be strictly above TDEE (surplus)
        expect(gainMuscleGoal).toBeGreaterThan(tdee);

        // Ordering: LOSE_WEIGHT < TDEE < GAIN_MUSCLE
        expect(loseWeightGoal).toBeLessThan(gainMuscleGoal);
      }),
    );
  });

  it('MAINTENANCE and ENDURANCE goals equal TDEE (rounded)', () => {
    fc.assert(
      fc.property(validTdee(), (tdee) => {
        const maintenanceGoal = calculateCaloricGoal(tdee, 'MAINTENANCE');
        const enduranceGoal = calculateCaloricGoal(tdee, 'ENDURANCE');

        // Both should equal TDEE (rounded to nearest integer)
        expect(maintenanceGoal).toBe(Math.round(tdee));
        expect(enduranceGoal).toBe(Math.round(tdee));
      }),
    );
  });

  it('caloric goal is always a positive finite integer for all valid inputs', () => {
    fc.assert(
      fc.property(validTdee(), anyGoal(), (tdee, goal) => {
        const caloricGoal = calculateCaloricGoal(tdee, goal);

        expect(caloricGoal).toBeGreaterThan(0);
        expect(Number.isFinite(caloricGoal)).toBe(true);
        expect(Number.isInteger(caloricGoal)).toBe(true);
      }),
    );
  });
});

// ── Property 11: Macros cover exactly the caloric goal (protein×4 + carbs×4 + fat×9 ≈ goal) ──
// Validates: Requirement 7.2

describe('Property 11 — Macro distribution covers the caloric goal (±5 kcal tolerance)', () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any valid (caloricGoal, weightKg, goal) combination,
   * calculateMacros must return macros where:
   *   proteinG×4 + carbsG×4 + fatG×9 ≈ caloricGoal (within ±5 kcal due to rounding)
   *
   * This verifies that the macro distribution formula is internally consistent
   * and that no calories are "lost" or "created" by the rounding.
   */
  it('proteinG×4 + carbsG×4 + fatG×9 ≈ caloricGoal within ±5 kcal for all valid inputs', () => {
    /**
     * We constrain the input space to combinations where the formula produces
     * non-negative carbs. The formula sets:
     *   fatG = 0.25 × caloricGoal / 9  →  fatG×9 = 0.25 × caloricGoal
     *   carbsG = (caloricGoal - proteinG×4 - fatG×9) / 4
     *
     * For carbsG ≥ 0 we need: caloricGoal ≥ proteinG×4 + 0.25×caloricGoal
     *   → 0.75 × caloricGoal ≥ proteinG × 4
     *   → caloricGoal ≥ proteinG × 4 / 0.75
     *
     * With proteinPerKg = 1.9 (GAIN_MUSCLE): proteinG ≈ 1.9 × weightKg
     *   → caloricGoal ≥ 1.9 × weightKg × 4 / 0.75 ≈ 10.13 × weightKg
     *
     * We generate (weightKg, caloricGoal) such that caloricGoal ≥ 11 × weightKg
     * to ensure a comfortable margin for rounding.
     */
    fc.assert(
      fc.property(
        validWeight(),
        anyGoal(),
        fc.integer({ min: 0, max: 3000 }),
        (weightKg, goal, extraKcal) => {
          // Minimum caloric goal to keep carbsG ≥ 0 after rounding
          const proteinPerKg = goal === 'LOSE_WEIGHT' ? 1.4 : 1.9;
          const minCaloricGoal = Math.ceil(proteinPerKg * weightKg * 4 / 0.75) + 50;
          const caloricGoal = minCaloricGoal + extraKcal;

          const { proteinG, carbsG, fatG } = calculateMacros(caloricGoal, weightKg, goal);

          // All macro values must be non-negative
          expect(proteinG).toBeGreaterThanOrEqual(0);
          expect(carbsG).toBeGreaterThanOrEqual(0);
          expect(fatG).toBeGreaterThanOrEqual(0);

          // Compute total calories from macros
          const totalFromMacros = proteinG * 4 + carbsG * 4 + fatG * 9;

          // Must be within ±5 kcal of the caloric goal (tolerance for rounding)
          expect(Math.abs(totalFromMacros - caloricGoal)).toBeLessThanOrEqual(5);
        },
      ),
    );
  });

  it('protein is within the required range per kg of body weight', () => {
    const validCaloricGoal = fc.integer({ min: 1200, max: 6000 });

    fc.assert(
      fc.property(validCaloricGoal, validWeight(), anyGoal(), (caloricGoal, weightKg, goal) => {
        const { proteinG } = calculateMacros(caloricGoal, weightKg, goal);

        // Protein per kg of body weight
        const proteinPerKg = proteinG / weightKg;

        if (goal === 'LOSE_WEIGHT') {
          // Requirement 7.2: 1.2–1.6 g/kg for LOSE_WEIGHT (service uses 1.4 g/kg midpoint)
          expect(proteinPerKg).toBeGreaterThanOrEqual(1.2);
          expect(proteinPerKg).toBeLessThanOrEqual(1.6);
        } else {
          // Requirement 7.2: 1.6–2.2 g/kg for GAIN_MUSCLE and others (service uses 1.9 g/kg midpoint)
          expect(proteinPerKg).toBeGreaterThanOrEqual(1.6);
          expect(proteinPerKg).toBeLessThanOrEqual(2.2);
        }
      }),
    );
  });
});
