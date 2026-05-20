/**
 * Unit tests for the `authenticate` middleware.
 *
 * Covers:
 *  - Valid token → passes through and attaches userId / user to the request
 *  - Missing Authorization header → 401
 *  - Malformed header (no "Bearer " prefix) → 401
 *  - Empty token → 401
 *  - Expired token → 401 with TOKEN_EXPIRED code
 *  - Invalid signature → 401 with TOKEN_INVALID code
 *  - Wrong algorithm → 401 with TOKEN_INVALID code
 *
 * Requirements: 1.10, 13.2
 */

// ── Mock env before any imports ───────────────────────────────────────────────

jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_AUDIENCE: 'https://test.api',
    JWT_PRIVATE_KEY_PATH: '/tmp/test-private.pem',
    JWT_PUBLIC_KEY_PATH: '/tmp/test-public.pem',
  },
}));

// ── Mock auth.service — control getPublicKey() ───────────────────────────────

jest.mock('../services/auth.service', () => ({
  getPublicKey: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';

import { authenticate, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { getPublicKey } from '../services/auth.service';

// ── RSA key pair for tests ────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// A second key pair to produce tokens with an invalid signature
const { privateKey: otherPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const mockGetPublicKey = getPublicKey as jest.MockedFunction<typeof getPublicKey>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a valid RS256 JWT signed with the test private key. */
function makeToken(
  payload: Record<string, unknown> = {},
  options: jwt.SignOptions = {},
): string {
  return jwt.sign(
    { sub: 'user-123', email: 'test@example.com', ...payload },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: '1h',
      issuer: 'https://test.auth0.com/',
      audience: 'https://test.api',
      ...options,
    },
  );
}

/** Create a minimal mock Express Request. */
function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
}

/** Create a mock Express Response that captures status + json calls. */
function makeRes() {
  const res = {
    _status: 0,
    _body: {} as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return res as typeof res & Response;
}

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPublicKey.mockReturnValue(publicKey as string);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. VALID TOKEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('authenticate — valid token', () => {
  it('calls next() and attaches userId + user to the request', () => {
    const token = makeToken();
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(/* no error */);
    const authedReq = req as AuthenticatedRequest;
    expect(authedReq.userId).toBe('user-123');
    expect(authedReq.user.email).toBe('test@example.com');
  });

  it('does not call res.status() when the token is valid', () => {
    const token = makeToken();
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res._status).toBe(0); // status() was never called
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MISSING / MALFORMED AUTHORIZATION HEADER → 401
// ═══════════════════════════════════════════════════════════════════════════════

describe('authenticate — missing or malformed header', () => {
  it('returns 401 when Authorization header is absent', () => {
    const req = makeReq(); // no header
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with "Bearer "', () => {
    const req = makeReq('Token some-token');
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Bearer token is an empty string', () => {
    const req = makeReq('Bearer ');
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. EXPIRED TOKEN → 401 with TOKEN_EXPIRED code
// ═══════════════════════════════════════════════════════════════════════════════

describe('authenticate — expired token', () => {
  it('returns 401 with TOKEN_EXPIRED code when the token is past its expiry', () => {
    // Sign a token that expired 1 second ago
    const expiredToken = makeToken({}, { expiresIn: -1 });
    const req = makeReq(`Bearer ${expiredToken}`);
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { code?: string }).code).toBe('TOKEN_EXPIRED');
    expect(next).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. INVALID SIGNATURE → 401 with TOKEN_INVALID code
// ═══════════════════════════════════════════════════════════════════════════════

describe('authenticate — invalid signature', () => {
  it('returns 401 with TOKEN_INVALID code when the token was signed with a different key', () => {
    // Sign with a different private key — verification against publicKey will fail
    const badToken = jwt.sign(
      { sub: 'attacker', email: 'evil@example.com' },
      otherPrivateKey,
      {
        algorithm: 'RS256',
        expiresIn: '1h',
        issuer: 'https://test.auth0.com/',
        audience: 'https://test.api',
      },
    );

    const req = makeReq(`Bearer ${badToken}`);
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { code?: string }).code).toBe('TOKEN_INVALID');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with TOKEN_INVALID code for a completely malformed token string', () => {
    const req = makeReq('Bearer this.is.not.a.jwt');
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { code?: string }).code).toBe('TOKEN_INVALID');
    expect(next).not.toHaveBeenCalled();
  });
});
