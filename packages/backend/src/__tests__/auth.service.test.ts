/**
 * Unit tests for Auth_Service
 * Covers: registration, login, refresh, logout, rate limiting, token rotation
 * Requirements: 1.6, 1.7, 13.6
 */

// ── Mock external dependencies before any imports ────────────────────────────

// Mock env config to avoid process.exit on missing env vars
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

// Mock fs so no real key files are needed
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => 'mock-key-content'),
}));

// Mock DB pool
jest.mock('../db/pool', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

// Mock Redis client
const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis),
}));

// Mock jsonwebtoken — no real RSA keys needed
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock.access.token'),
  verify: jest.fn(),
}));

// Mock bcrypt — avoid slow real hashing in unit tests
jest.mock('bcrypt', () => ({
  hash: jest.fn(async (password: string) => `hashed:${password}`),
  compare: jest.fn(async (plain: string, hashed: string) => hashed === `hashed:${plain}`),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { query, withTransaction } from '../db/pool';
import {
  registerLocal,
  loginLocal,
  refreshAccessToken,
  logout,
  recordFailedAttempt,
  getLockoutTTL,
  clearFailedAttempts,
  generateRefreshToken,
  BCRYPT_ROUNDS,
} from '../services/auth.service';

// Typed mock helpers
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;


// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    auth0_id: 'local|user-123',
    name: 'Test User',
    password_hash: 'hashed:Password1',
    email_verified: 1,
    is_active: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeRefreshTokenRow(overrides: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return {
    id: 'rt-abc',
    user_id: 'user-123',
    token_hash: 'some-hash',
    expires_at: future,
    revoked: 0,
    created_at: new Date(),
    email: 'test@example.com',
    ...overrides,
  };
}

// ── beforeEach: reset all mocks ───────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default Redis: no lockout, no failed attempts
  mockRedis.ttl.mockResolvedValue(-1);
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
});


// ═══════════════════════════════════════════════════════════════════════════════
// 1. REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('registerLocal', () => {
  it('registers a new user successfully and returns userId + verificationToken', async () => {
    // No existing user
    mockQuery.mockResolvedValueOnce([]); // SELECT existing user
    // withTransaction executes the inserts
    mockWithTransaction.mockImplementation(async (fn) => {
      const fakeConn = { execute: jest.fn().mockResolvedValue([]) };
      return fn(fakeConn as any);
    });

    const result = await registerLocal({
      email: 'new@example.com',
      password: 'Password1',
      name: 'New User',
    });

    expect(result.userId).toBeDefined();
    expect(typeof result.userId).toBe('string');
    expect(result.verificationToken).toBeDefined();
    expect(typeof result.verificationToken).toBe('string');
  });

  it('throws EMAIL_EXISTS when email is already registered', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'existing-user' }]);

    await expect(
      registerLocal({ email: 'taken@example.com', password: 'Password1', name: 'User' }),
    ).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });
  });

  it('hashes the password with bcrypt (cost factor = BCRYPT_ROUNDS)', async () => {
    const bcrypt = require('bcrypt');
    mockQuery.mockResolvedValueOnce([]);
    mockWithTransaction.mockImplementation(async (fn) => {
      const fakeConn = { execute: jest.fn().mockResolvedValue([]) };
      return fn(fakeConn as any);
    });

    await registerLocal({ email: 'a@b.com', password: 'Password1', name: 'A' });

    expect(bcrypt.hash).toHaveBeenCalledWith('Password1', BCRYPT_ROUNDS);
    expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(12); // Requirement 1.9
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 2. LOGIN
// ═══════════════════════════════════════════════════════════════════════════════

describe('loginLocal', () => {
  it('returns tokens and user info on valid credentials', async () => {
    mockRedis.ttl.mockResolvedValue(-1); // not locked
    mockQuery
      .mockResolvedValueOnce([makeUserRow()]) // SELECT user
      .mockResolvedValueOnce([]); // INSERT refresh token

    const result = await loginLocal({ email: 'test@example.com', password: 'Password1' });

    expect(result.tokens.accessToken).toBe('mock.access.token');
    expect(result.tokens.refreshToken).toBeDefined();
    expect(result.tokens.expiresIn).toBe(24 * 60 * 60);
    expect(result.user.email).toBe('test@example.com');
    expect(result.user.emailVerified).toBe(true);
  });

  it('throws INVALID_CREDENTIALS for wrong password', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockQuery.mockResolvedValueOnce([makeUserRow()]); // user found

    await expect(
      loginLocal({ email: 'test@example.com', password: 'WrongPass1' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('throws INVALID_CREDENTIALS when user does not exist', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockQuery.mockResolvedValueOnce([]); // no user found

    await expect(
      loginLocal({ email: 'nobody@example.com', password: 'Password1' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('throws ACCOUNT_LOCKED when lockout TTL > 0 (Requirement 1.6)', async () => {
    mockRedis.ttl.mockResolvedValue(600); // 10 minutes remaining

    await expect(
      loginLocal({ email: 'locked@example.com', password: 'Password1' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });

  it('increments failed attempt counter on bad credentials', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockQuery.mockResolvedValueOnce([makeUserRow()]);

    await expect(
      loginLocal({ email: 'test@example.com', password: 'WrongPass1' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(mockRedis.incr).toHaveBeenCalled();
  });

  it('clears failed attempts on successful login', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockQuery
      .mockResolvedValueOnce([makeUserRow()])
      .mockResolvedValueOnce([]); // INSERT refresh token

    await loginLocal({ email: 'test@example.com', password: 'Password1' });

    expect(mockRedis.del).toHaveBeenCalled();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 3. RATE LIMITING — 5 failed attempts → 15-min lockout (Requirement 1.6)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Rate limiting — failed login attempts', () => {
  it('recordFailedAttempt returns remaining attempts before lockout', async () => {
    mockRedis.incr.mockResolvedValue(2); // 2nd attempt

    const remaining = await recordFailedAttempt('user@example.com');

    expect(remaining).toBe(3); // 5 - 2 = 3 remaining
    expect(mockRedis.incr).toHaveBeenCalled();
    expect(mockRedis.expire).toHaveBeenCalled();
  });

  it('activates lockout after 5th failed attempt and returns 0', async () => {
    mockRedis.incr.mockResolvedValue(5); // 5th attempt triggers lockout

    const remaining = await recordFailedAttempt('user@example.com');

    expect(remaining).toBe(0);
    // Should set lockout key with 15-min TTL
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('lockout'),
      '1',
      { EX: 15 * 60 },
    );
    // Should delete the counter key
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('getLockoutTTL returns 0 when not locked', async () => {
    mockRedis.ttl.mockResolvedValue(-2); // key does not exist

    const ttl = await getLockoutTTL('user@example.com');

    expect(ttl).toBe(0);
  });

  it('getLockoutTTL returns remaining seconds when locked', async () => {
    mockRedis.ttl.mockResolvedValue(750); // 12.5 minutes remaining

    const ttl = await getLockoutTTL('user@example.com');

    expect(ttl).toBe(750);
  });

  it('clearFailedAttempts removes both counter and lockout keys', async () => {
    await clearFailedAttempts('user@example.com');

    expect(mockRedis.del).toHaveBeenCalledTimes(2);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 4. REFRESH TOKEN — rotation and expiry (Requirements 1.7, 13.6)
// ═══════════════════════════════════════════════════════════════════════════════

describe('refreshAccessToken', () => {
  it('issues new access + refresh tokens and revokes the old one', async () => {
    mockQuery
      .mockResolvedValueOnce([makeRefreshTokenRow()]) // SELECT refresh token
      .mockResolvedValueOnce([]) // UPDATE revoke old token
      .mockResolvedValueOnce([]); // INSERT new refresh token

    const tokens = await refreshAccessToken('valid-raw-token');

    expect(tokens.accessToken).toBe('mock.access.token');
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.expiresIn).toBe(24 * 60 * 60); // 24 h — Requirement 13.6
    // Old token should be revoked
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('revoked = 1'),
      expect.any(Array),
    );
  });

  it('throws INVALID_REFRESH_TOKEN when token is not found', async () => {
    mockQuery.mockResolvedValueOnce([]); // no token found

    await expect(refreshAccessToken('unknown-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws REFRESH_TOKEN_REVOKED when token has been revoked', async () => {
    mockQuery.mockResolvedValueOnce([makeRefreshTokenRow({ revoked: 1 })]);

    await expect(refreshAccessToken('revoked-token')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REVOKED',
    });
  });

  it('throws REFRESH_TOKEN_EXPIRED when token is past its expiry date (Requirement 13.6)', async () => {
    const past = new Date(Date.now() - 1000); // 1 second ago
    mockQuery.mockResolvedValueOnce([makeRefreshTokenRow({ expires_at: past })]);

    await expect(refreshAccessToken('expired-token')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_EXPIRED',
    });
  });

  it('generates a new refresh token different from the old one (rotation)', async () => {
    const { token: token1 } = generateRefreshToken();
    const { token: token2 } = generateRefreshToken();

    // Each call should produce a unique token
    expect(token1).not.toBe(token2);
    expect(token1).toHaveLength(96); // 48 bytes → 96 hex chars
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 5. LOGOUT
// ═══════════════════════════════════════════════════════════════════════════════

describe('logout', () => {
  it('revokes the refresh token in the database', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await logout('some-raw-refresh-token');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('revoked = 1'),
      expect.any(Array),
    );
  });

  it('does not throw when token is not found (idempotent logout)', async () => {
    mockQuery.mockResolvedValueOnce([]); // UPDATE affects 0 rows — still OK

    await expect(logout('nonexistent-token')).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. TOKEN GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateRefreshToken', () => {
  it('returns a token and its SHA-256 hash', () => {
    const { token, hash } = generateRefreshToken();

    expect(token).toBeDefined();
    expect(hash).toBeDefined();
    expect(token).not.toBe(hash);
  });

  it('hash is deterministic for the same token', () => {
    const crypto = require('crypto');
    const { token, hash } = generateRefreshToken();
    const expectedHash = crypto.createHash('sha256').update(token).digest('hex');

    expect(hash).toBe(expectedHash);
  });

  it('produces unique tokens on each call', () => {
    const tokens = Array.from({ length: 10 }, () => generateRefreshToken().token);
    const unique = new Set(tokens);

    expect(unique.size).toBe(10);
  });
});
