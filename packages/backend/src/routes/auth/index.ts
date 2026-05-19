/**
 * Auth router — mounts all /auth/* endpoints.
 *
 * POST /auth/register          — local email/password registration
 * POST /auth/login             — local email/password login
 * POST /auth/callback          — OAuth 2.0 Google callback (via Auth0)
 * POST /auth/refresh           — rotate refresh token
 * POST /auth/logout            — revoke refresh token
 * POST /auth/forgot-password   — request password reset link
 * POST /auth/reset-password    — apply new password with reset token
 * GET  /auth/verify-email/:token — verify email address
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.9, 1.10, 13.6
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { z } from 'zod';

import {
  registerLocal,
  loginLocal,
  handleOAuthCallback,
  refreshAccessToken,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getRedis,
} from '../../services/auth.service.js';

export const authRouter = Router();

// ── Input validation schemas ──────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(1).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const callbackSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// ── Rate limiters (Requirement 1.6) ──────────────────────────────────────────
// Uses Redis store for distributed rate limiting across multiple instances.
// Falls back to in-memory store if Redis is unavailable at startup.

/**
 * Build rate limiters lazily so the Redis client is already connected.
 * Called once on first request to /auth/*.
 */
let _authRateLimiter: ReturnType<typeof rateLimit> | null = null;
let _loginRateLimiter: ReturnType<typeof rateLimit> | null = null;

async function buildRateLimiters(): Promise<void> {
  if (_authRateLimiter) return;

  try {
    const redis = await getRedis();

    // General limiter: 30 requests / 15 min per IP across all /auth/* routes
    _authRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
      store: new RedisStore({
        sendCommand: (...args: string[]) => redis.sendCommand(args),
        prefix: 'rl:auth:',
      }),
    });

    // Stricter limiter: 10 requests / 15 min per IP for login/register/forgot-password
    _loginRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many login attempts, please try again later.' },
      store: new RedisStore({
        sendCommand: (...args: string[]) => redis.sendCommand(args),
        prefix: 'rl:login:',
      }),
    });
  } catch (err) {
    // Redis unavailable — fall back to in-memory store (single-instance only)
    console.warn('[Auth] Redis unavailable for rate limiting, falling back to in-memory store:', err);

    _authRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    });

    _loginRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many login attempts, please try again later.' },
    });
  }
}

/** Middleware that initialises rate limiters on first use then delegates. */
function lazyAuthRateLimit(req: Request, res: Response, next: NextFunction): void {
  buildRateLimiters()
    .then(() => _authRateLimiter!(req, res, next))
    .catch(next);
}

function lazyLoginRateLimit(req: Request, res: Response, next: NextFunction): void {
  buildRateLimiters()
    .then(() => _loginRateLimiter!(req, res, next))
    .catch(next);
}

// Apply general rate limiter to all /auth/* routes
authRouter.use(lazyAuthRateLimit);

// ── Helper: wrap async route handlers ────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── Helper: map service error codes to HTTP status ───────────────────────────

function errorResponse(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code;
    const retryAfter = (err as Error & { retryAfter?: number }).retryAfter;

    switch (code) {
      case 'EMAIL_EXISTS':
        res.status(409).json({ error: err.message, code });
        return;
      case 'INVALID_CREDENTIALS':
        res.status(401).json({ error: err.message, code });
        return;
      case 'ACCOUNT_LOCKED':
        res
          .status(429)
          .set('Retry-After', String(retryAfter ?? 900))
          .json({ error: err.message, code, retryAfter });
        return;
      case 'INVALID_REFRESH_TOKEN':
      case 'REFRESH_TOKEN_REVOKED':
      case 'REFRESH_TOKEN_EXPIRED':
        res.status(401).json({ error: err.message, code });
        return;
      case 'INVALID_RESET_TOKEN':
      case 'RESET_TOKEN_USED':
      case 'RESET_TOKEN_EXPIRED':
        res.status(400).json({ error: err.message, code });
        return;
      case 'INVALID_VERIFY_TOKEN':
      case 'VERIFY_TOKEN_USED':
      case 'VERIFY_TOKEN_EXPIRED':
        res.status(400).json({ error: err.message, code });
        return;
      case 'OAUTH_EXCHANGE_FAILED':
      case 'OAUTH_USERINFO_FAILED':
        res.status(502).json({ error: err.message, code });
        return;
      default:
        res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── POST /auth/register ───────────────────────────────────────────────────────

authRouter.post(
  '/register',
  lazyLoginRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await registerLocal(parsed.data);
      // In production, the verificationToken would be emailed, not returned in the response.
      // We include it here so integration tests / email services can pick it up.
      res.status(201).json({
        message: 'Registration successful. Please verify your email.',
        userId: result.userId,
        // Only expose the token in non-production environments for testing convenience
        ...(process.env['NODE_ENV'] !== 'production' && {
          verificationToken: result.verificationToken,
        }),
      });
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── POST /auth/login ──────────────────────────────────────────────────────────

authRouter.post(
  '/login',
  lazyLoginRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await loginLocal(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── POST /auth/callback ───────────────────────────────────────────────────────

authRouter.post(
  '/callback',
  asyncHandler(async (req, res) => {
    const parsed = callbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await handleOAuthCallback(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── POST /auth/refresh ────────────────────────────────────────────────────────

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const tokens = await refreshAccessToken(parsed.data.refreshToken);
      res.status(200).json(tokens);
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── POST /auth/logout ─────────────────────────────────────────────────────────

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      await logout(parsed.data.refreshToken);
      res.status(200).json({ message: 'Logged out successfully.' });
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── POST /auth/forgot-password ────────────────────────────────────────────────

authRouter.post(
  '/forgot-password',
  lazyLoginRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await forgotPassword(parsed.data.email);
      // Always return 200 to avoid user enumeration (Requirement 1.5)
      res.status(200).json({
        message: 'If that email is registered, a reset link has been sent.',
        // Only expose the token in non-production environments for testing convenience
        ...(process.env['NODE_ENV'] !== 'production' && result && {
          resetToken: result.resetToken,
        }),
      });
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── POST /auth/reset-password ─────────────────────────────────────────────────

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      await resetPassword(parsed.data.token, parsed.data.password);
      res.status(200).json({ message: 'Password reset successfully.' });
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);

// ── GET /auth/verify-email/:token ─────────────────────────────────────────────

authRouter.get(
  '/verify-email/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Missing verification token' });
      return;
    }

    try {
      const result = await verifyEmail(token);
      res.status(200).json({ message: 'Email verified successfully.', userId: result.userId });
    } catch (err) {
      errorResponse(res, err);
    }
  }),
);
