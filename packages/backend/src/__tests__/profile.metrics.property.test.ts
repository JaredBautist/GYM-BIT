/**
 * Property-based tests for profile metric calculations.
 *
 * **Validates: Requirements 3.4, 3.5**
 *
 * Uses fast-check to verify mathematical invariants across the full
 * valid input space defined in the requirements:
 *   - weight: 30–300 kg
 *   - height: 100–250 cm
 *   - age:    13–120 years
 */

// ── Mock external dependencies before any imports ────────────────────────────

// Prevent process.exit on missing env vars
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
  calculateBMI,
  calculateBMR,
  calculateTDEE,
  ACTIVITY_FACTORS,
  ActivityLevel,
} from '../services/profile.service';

// ── Arbitraries for valid input ranges ───────────────────────────────────────

const validWeight = () => fc.float({ min: 30, max: 300, noNaN: true });
const validHeight = () => fc.float({ min: 100, max: 250, noNaN: true });
const validAge    = () => fc.integer({ min: 13, max: 120 });

/** All five activity levels in ascending order of intensity. */
const ACTIVITY_LEVELS_ORDERED: ActivityLevel[] = [
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
];

// ── Helper ────────────────────────────────────────────────────────────────────

/** Returns true when a number is rounded to at most 2 decimal places. */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.round(value * 100) / 100 === value;
}

// ── Property 1: BMI is always positive and finite for valid inputs ────────────
// Validates: Requirement 3.4

describe('Property 1 — BMI always positive and finite for valid inputs', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For every valid (weight, height) pair the BMI must be:
   *   - strictly greater than 0
   *   - a finite number (no Infinity / NaN)
   */
  it('calculateBMI(w, h) > 0 and is finite for all valid inputs', () => {
    fc.assert(
      fc.property(validWeight(), validHeight(), (weight, height) => {
        const bmi = calculateBMI(weight, height);
        expect(bmi).toBeGreaterThan(0);
        expect(Number.isFinite(bmi)).toBe(true);
      }),
    );
  });
});

// ── Property 2: BMI is rounded to exactly 2 decimal places ───────────────────
// Validates: Requirement 3.4

describe('Property 2 — BMI is rounded to exactly 2 decimal places', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * The result of calculateBMI must always have at most 2 decimal places,
   * matching the "dos decimales de precisión" requirement.
   */
  it('calculateBMI(w, h) has at most 2 decimal places for all valid inputs', () => {
    fc.assert(
      fc.property(validWeight(), validHeight(), (weight, height) => {
        const bmi = calculateBMI(weight, height);
        expect(hasAtMostTwoDecimals(bmi)).toBe(true);
      }),
    );
  });
});

// ── Property 3: BMR male > BMR female for identical physical parameters ───────
// Validates: Requirement 3.5

describe('Property 3 — BMR male > BMR female for same physical parameters', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * The Mifflin-St Jeor formula adds +5 for males and −161 for females,
   * so the male BMR must always exceed the female BMR by exactly 166 kcal
   * for any valid (weight, height, age) triple.
   */
  it('calculateBMR(w, h, age, "male") > calculateBMR(w, h, age, "female") by exactly 166', () => {
    fc.assert(
      fc.property(validWeight(), validHeight(), validAge(), (weight, height, age) => {
        const maleBMR   = calculateBMR(weight, height, age, 'male');
        const femaleBMR = calculateBMR(weight, height, age, 'female');

        expect(maleBMR).toBeGreaterThan(femaleBMR);

        // The difference must be exactly 166 = 5 − (−161)
        // Both values are rounded to 2 dp, so the difference is also exact.
        const diff = Math.round((maleBMR - femaleBMR) * 100) / 100;
        expect(diff).toBeCloseTo(166, 5);
      }),
    );
  });
});

// ── Property 4: TDEE = BMR × ACTIVITY_FACTORS[level] (rounded to 2 dp) ───────
// Validates: Requirement 3.5

describe('Property 4 — TDEE equals BMR × activity factor (rounded to 2 dp)', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For every valid BMR value and every one of the five activity levels,
   * calculateTDEE must return exactly bmr × ACTIVITY_FACTORS[level]
   * rounded to 2 decimal places.
   */
  it('calculateTDEE(bmr, level) === round(bmr × ACTIVITY_FACTORS[level], 2) for all levels', () => {
    // BMR is derived from valid physical inputs; use a representative range.
    const validBMR = fc.float({ min: 500, max: 5000, noNaN: true });
    const anyLevel = fc.constantFrom(...ACTIVITY_LEVELS_ORDERED);

    fc.assert(
      fc.property(validBMR, anyLevel, (bmr, level) => {
        const tdee     = calculateTDEE(bmr, level);
        const expected = Math.round(bmr * ACTIVITY_FACTORS[level] * 100) / 100;

        expect(tdee).toBeCloseTo(expected, 5);
        expect(hasAtMostTwoDecimals(tdee)).toBe(true);
      }),
    );
  });
});

// ── Property 5: TDEE increases monotonically with activity level ──────────────
// Validates: Requirement 3.5

describe('Property 5 — TDEE increases monotonically with activity level', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any positive BMR, the TDEE must satisfy:
   *   SEDENTARY < LIGHT < MODERATE < ACTIVE < VERY_ACTIVE
   *
   * This confirms that the five multipliers are strictly ordered.
   */
  it('TDEE(SEDENTARY) < TDEE(LIGHT) < TDEE(MODERATE) < TDEE(ACTIVE) < TDEE(VERY_ACTIVE)', () => {
    const validBMR = fc.float({ min: 500, max: 5000, noNaN: true });

    fc.assert(
      fc.property(validBMR, (bmr) => {
        const tdees = ACTIVITY_LEVELS_ORDERED.map((level) => calculateTDEE(bmr, level));

        for (let i = 0; i < tdees.length - 1; i++) {
          expect(tdees[i]).toBeLessThan(tdees[i + 1]!);
        }
      }),
    );
  });
});
