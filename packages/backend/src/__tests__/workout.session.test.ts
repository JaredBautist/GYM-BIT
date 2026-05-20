/**
 * Unit tests for workout session volume calculation and PR detection.
 *
 * Covers:
 *  - completeSession: total_volume_kg calculation (Requirement 5.4)
 *  - logSerie: PR detection logic (Requirements 5.5, 4.5)
 *
 * Requirements: 5.4, 5.5, 4.5
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

import { completeSession, logSerie } from '../services/workout.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-123',
    user_id: 'user-abc',
    plan_id: null,
    started_at: new Date(Date.now() - 3600_000), // 1 hour ago
    completed_at: null,
    total_volume_kg: null,
    duration_seconds: null,
    is_active: 1,
    offline_state: null,
    ...overrides,
  };
}

function makeSerieLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'serie-456',
    session_id: 'session-123',
    exercise_id: 'exercise-789',
    set_number: 1,
    weight_kg: 100,
    reps_done: 10,
    logged_at: new Date(),
    is_pr: 0,
    ...overrides,
  };
}

function makePersonalRecordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pr-001',
    user_id: 'user-abc',
    exercise_id: 'exercise-789',
    weight_kg: 80,
    reps: 10,
    achieved_at: new Date(),
    ...overrides,
  };
}

// ── beforeEach: reset all mocks ───────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// completeSession — Volume calculation (Requirement 5.4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('completeSession — volume calculation (Req 5.4)', () => {
  it('sets total_volume_kg to the sum of weight_kg × reps_done from all series', async () => {
    const sessionId = 'session-123';
    const userId = 'user-abc';

    // 1. SELECT active session → found
    mockQuery
      .mockResolvedValueOnce([makeSessionRow()])
      // 2. SUM(weight_kg * reps_done) → 1500 (e.g. 100kg×10 + 50kg×5 = 1250, or any value)
      .mockResolvedValueOnce([{ total_volume: 1500 }])
      // 3. UPDATE SESSIONS
      .mockResolvedValueOnce([])
      // 4. SELECT updated session
      .mockResolvedValueOnce([makeSessionRow({ total_volume_kg: 1500, is_active: 0, completed_at: new Date() })]);

    const result = await completeSession(sessionId, userId);

    expect(result.total_volume_kg).toBe(1500);

    // Verify the UPDATE was called with the correct volume
    const updateCall = mockQuery.mock.calls.find(
      (call) => String(call[0]).includes('total_volume_kg') && String(call[0]).includes('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain(1500);
  });

  it('sets total_volume_kg = 0 when there are no series logged', async () => {
    const sessionId = 'session-empty';
    const userId = 'user-abc';

    mockQuery
      .mockResolvedValueOnce([makeSessionRow({ id: sessionId })])
      // SUM returns NULL when no rows → service defaults to 0
      .mockResolvedValueOnce([{ total_volume: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeSessionRow({ id: sessionId, total_volume_kg: 0, is_active: 0, completed_at: new Date() })]);

    const result = await completeSession(sessionId, userId);

    expect(result.total_volume_kg).toBe(0);

    // Verify UPDATE was called with 0
    const updateCall = mockQuery.mock.calls.find(
      (call) => String(call[0]).includes('total_volume_kg') && String(call[0]).includes('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain(0);
  });

  it("throws 'Active session not found' when session doesn't exist or isn't active", async () => {
    const sessionId = 'nonexistent-session';
    const userId = 'user-abc';

    // SELECT returns empty → session not found or not active
    mockQuery.mockResolvedValueOnce([]);

    await expect(completeSession(sessionId, userId)).rejects.toThrow('Active session not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// logSerie — PR detection (Requirements 5.5, 4.5)
// ═══════════════════════════════════════════════════════════════════════════════

describe('logSerie — PR detection (Req 5.5, 4.5)', () => {
  const userId = 'user-abc';
  const sessionId = 'session-123';
  const exerciseId = 'exercise-789';

  it('returns isPr: true when weightKg × repsDone exceeds the current PR', async () => {
    // Current PR: 80kg × 10 = 800
    // New serie: 100kg × 10 = 1000 → exceeds PR
    mockQuery
      .mockResolvedValueOnce([])                                          // INSERT SERIE_LOG
      .mockResolvedValueOnce([makePersonalRecordRow({ weight_kg: 80, reps: 10 })]) // SELECT current PR
      .mockResolvedValueOnce([])                                          // UPDATE PERSONAL_RECORDS
      .mockResolvedValueOnce([])                                          // UPDATE SERIE_LOGS is_pr=TRUE
      .mockResolvedValueOnce([makeSerieLogRow({ weight_kg: 100, reps_done: 10, is_pr: 1 })]); // SELECT serie

    const result = await logSerie(userId, sessionId, exerciseId, 1, 100, 10);

    expect(result.isPr).toBe(true);
  });

  it('returns isPr: false when weightKg × repsDone equals the current PR (not strictly greater)', async () => {
    // Current PR: 100kg × 10 = 1000
    // New serie: 100kg × 10 = 1000 → equal, NOT a new PR
    mockQuery
      .mockResolvedValueOnce([])                                          // INSERT SERIE_LOG
      .mockResolvedValueOnce([makePersonalRecordRow({ weight_kg: 100, reps: 10 })]) // SELECT current PR
      .mockResolvedValueOnce([makeSerieLogRow({ weight_kg: 100, reps_done: 10, is_pr: 0 })]); // SELECT serie

    const result = await logSerie(userId, sessionId, exerciseId, 1, 100, 10);

    expect(result.isPr).toBe(false);
  });

  it('returns isPr: true when there is no existing PR for the exercise (first time)', async () => {
    // No current PR → currentPrVolume = 0
    // New serie: 60kg × 5 = 300 → exceeds 0
    mockQuery
      .mockResolvedValueOnce([])                                          // INSERT SERIE_LOG
      .mockResolvedValueOnce([])                                          // SELECT current PR → empty (no PR)
      .mockResolvedValueOnce([])                                          // INSERT PERSONAL_RECORDS
      .mockResolvedValueOnce([])                                          // UPDATE SERIE_LOGS is_pr=TRUE
      .mockResolvedValueOnce([makeSerieLogRow({ weight_kg: 60, reps_done: 5, is_pr: 1 })]); // SELECT serie

    const result = await logSerie(userId, sessionId, exerciseId, 1, 60, 5);

    expect(result.isPr).toBe(true);
  });

  it('returns isPr: false when weightKg × repsDone is less than the current PR', async () => {
    // Current PR: 100kg × 10 = 1000
    // New serie: 50kg × 5 = 250 → less than PR
    mockQuery
      .mockResolvedValueOnce([])                                          // INSERT SERIE_LOG
      .mockResolvedValueOnce([makePersonalRecordRow({ weight_kg: 100, reps: 10 })]) // SELECT current PR
      .mockResolvedValueOnce([makeSerieLogRow({ weight_kg: 50, reps_done: 5, is_pr: 0 })]); // SELECT serie

    const result = await logSerie(userId, sessionId, exerciseId, 1, 50, 5);

    expect(result.isPr).toBe(false);
  });

  it('updates PERSONAL_RECORDS when isPr: true (existing PR → UPDATE)', async () => {
    // Current PR: 80kg × 10 = 800; new: 100kg × 10 = 1000 → new PR
    mockQuery
      .mockResolvedValueOnce([])                                          // INSERT SERIE_LOG
      .mockResolvedValueOnce([makePersonalRecordRow({ weight_kg: 80, reps: 10 })]) // SELECT current PR
      .mockResolvedValueOnce([])                                          // UPDATE PERSONAL_RECORDS
      .mockResolvedValueOnce([])                                          // UPDATE SERIE_LOGS is_pr=TRUE
      .mockResolvedValueOnce([makeSerieLogRow({ weight_kg: 100, reps_done: 10, is_pr: 1 })]);

    await logSerie(userId, sessionId, exerciseId, 1, 100, 10);

    // Verify that a query touching PERSONAL_RECORDS with UPDATE was called
    const prUpdateCall = mockQuery.mock.calls.find(
      (call) =>
        String(call[0]).includes('PERSONAL_RECORDS') &&
        String(call[0]).toUpperCase().includes('UPDATE'),
    );
    expect(prUpdateCall).toBeDefined();
  });

  it('inserts into PERSONAL_RECORDS when isPr: true and no prior PR exists (INSERT)', async () => {
    // No current PR → INSERT new record
    mockQuery
      .mockResolvedValueOnce([])  // INSERT SERIE_LOG
      .mockResolvedValueOnce([])  // SELECT current PR → empty
      .mockResolvedValueOnce([])  // INSERT PERSONAL_RECORDS
      .mockResolvedValueOnce([])  // UPDATE SERIE_LOGS is_pr=TRUE
      .mockResolvedValueOnce([makeSerieLogRow({ weight_kg: 60, reps_done: 5, is_pr: 1 })]);

    await logSerie(userId, sessionId, exerciseId, 1, 60, 5);

    // Verify that a query touching PERSONAL_RECORDS with INSERT was called
    const prInsertCall = mockQuery.mock.calls.find(
      (call) =>
        String(call[0]).includes('PERSONAL_RECORDS') &&
        String(call[0]).toUpperCase().includes('INSERT'),
    );
    expect(prInsertCall).toBeDefined();
  });

  it('marks SERIE_LOG with is_pr = TRUE when isPr: true', async () => {
    // Current PR: 80kg × 10 = 800; new: 100kg × 10 = 1000 → new PR
    mockQuery
      .mockResolvedValueOnce([])                                          // INSERT SERIE_LOG
      .mockResolvedValueOnce([makePersonalRecordRow({ weight_kg: 80, reps: 10 })]) // SELECT current PR
      .mockResolvedValueOnce([])                                          // UPDATE PERSONAL_RECORDS
      .mockResolvedValueOnce([])                                          // UPDATE SERIE_LOGS is_pr=TRUE
      .mockResolvedValueOnce([makeSerieLogRow({ weight_kg: 100, reps_done: 10, is_pr: 1 })]);

    await logSerie(userId, sessionId, exerciseId, 1, 100, 10);

    // Verify that a query updating SERIE_LOGS with is_pr = TRUE was called
    const serieIsPrCall = mockQuery.mock.calls.find(
      (call) =>
        String(call[0]).includes('SERIE_LOGS') &&
        String(call[0]).toUpperCase().includes('UPDATE') &&
        String(call[0]).includes('is_pr'),
    );
    expect(serieIsPrCall).toBeDefined();
    // The SQL should set is_pr = TRUE
    expect(String(serieIsPrCall![0]).toUpperCase()).toContain('TRUE');
  });
});
