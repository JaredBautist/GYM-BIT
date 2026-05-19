/**
 * Unit tests for profile field validation.
 *
 * Covers: age validation (Req 3.6), height validation (Req 3.7),
 *         weight validation (Req 3.8), and multiple simultaneous errors.
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

jest.mock('../db/pool', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { validateProfileFields } from '../services/profile.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns an ISO date string (YYYY-MM-DD) for a person who is exactly
 * `years` years old today (birthday already passed this year).
 */
function birthDateForAge(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  // Move one day forward so the birthday has already occurred this year,
  // ensuring ageFromBirthDate returns exactly `years`.
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AGE VALIDATION — Requirement 3.6
// ═══════════════════════════════════════════════════════════════════════════════

describe('Age validation (Requirement 3.6)', () => {
  it('returns UNDERAGE error for a 12-year-old user', () => {
    const errors = validateProfileFields({ birth_date: birthDateForAge(12) });
    const ageError = errors.find((e) => e.code === 'UNDERAGE');
    expect(ageError).toBeDefined();
  });

  it('returns no age error for a 13-year-old user (minimum allowed age)', () => {
    const errors = validateProfileFields({ birth_date: birthDateForAge(13) });
    const ageError = errors.find((e) => e.code === 'UNDERAGE');
    expect(ageError).toBeUndefined();
  });

  it('UNDERAGE error message mentions the minimum age requirement', () => {
    const errors = validateProfileFields({ birth_date: birthDateForAge(12) });
    const ageError = errors.find((e) => e.code === 'UNDERAGE');
    expect(ageError).toBeDefined();
    // The message should reference "13" (the minimum age)
    expect(ageError!.message).toMatch(/13/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. HEIGHT VALIDATION — Requirement 3.7
// ═══════════════════════════════════════════════════════════════════════════════

describe('Height validation (Requirement 3.7)', () => {
  it('returns INVALID_HEIGHT error for height 99 cm (below minimum)', () => {
    const errors = validateProfileFields({ height_cm: 99 });
    const heightError = errors.find((e) => e.code === 'INVALID_HEIGHT');
    expect(heightError).toBeDefined();
  });

  it('returns INVALID_HEIGHT error for height 251 cm (above maximum)', () => {
    const errors = validateProfileFields({ height_cm: 251 });
    const heightError = errors.find((e) => e.code === 'INVALID_HEIGHT');
    expect(heightError).toBeDefined();
  });

  it('returns no height error for height 100 cm (lower boundary)', () => {
    const errors = validateProfileFields({ height_cm: 100 });
    const heightError = errors.find((e) => e.code === 'INVALID_HEIGHT');
    expect(heightError).toBeUndefined();
  });

  it('returns no height error for height 250 cm (upper boundary)', () => {
    const errors = validateProfileFields({ height_cm: 250 });
    const heightError = errors.find((e) => e.code === 'INVALID_HEIGHT');
    expect(heightError).toBeUndefined();
  });

  it('returns no height error for height 175 cm (valid mid-range value)', () => {
    const errors = validateProfileFields({ height_cm: 175 });
    const heightError = errors.find((e) => e.code === 'INVALID_HEIGHT');
    expect(heightError).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. WEIGHT VALIDATION — Requirement 3.8
// ═══════════════════════════════════════════════════════════════════════════════

describe('Weight validation (Requirement 3.8)', () => {
  it('returns INVALID_WEIGHT error for weight 29 kg (below minimum)', () => {
    const errors = validateProfileFields({ weight_kg: 29 });
    const weightError = errors.find((e) => e.code === 'INVALID_WEIGHT');
    expect(weightError).toBeDefined();
  });

  it('returns INVALID_WEIGHT error for weight 301 kg (above maximum)', () => {
    const errors = validateProfileFields({ weight_kg: 301 });
    const weightError = errors.find((e) => e.code === 'INVALID_WEIGHT');
    expect(weightError).toBeDefined();
  });

  it('returns no weight error for weight 30 kg (lower boundary)', () => {
    const errors = validateProfileFields({ weight_kg: 30 });
    const weightError = errors.find((e) => e.code === 'INVALID_WEIGHT');
    expect(weightError).toBeUndefined();
  });

  it('returns no weight error for weight 300 kg (upper boundary)', () => {
    const errors = validateProfileFields({ weight_kg: 300 });
    const weightError = errors.find((e) => e.code === 'INVALID_WEIGHT');
    expect(weightError).toBeUndefined();
  });

  it('returns no weight error for weight 75 kg (valid mid-range value)', () => {
    const errors = validateProfileFields({ weight_kg: 75 });
    const weightError = errors.find((e) => e.code === 'INVALID_WEIGHT');
    expect(weightError).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MULTIPLE ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Multiple validation errors', () => {
  it('returns 2 errors when both height and weight are out of range', () => {
    const errors = validateProfileFields({ height_cm: 50, weight_kg: 5 });
    expect(errors).toHaveLength(2);
    const codes = errors.map((e) => e.code);
    expect(codes).toContain('INVALID_HEIGHT');
    expect(codes).toContain('INVALID_WEIGHT');
  });
});
