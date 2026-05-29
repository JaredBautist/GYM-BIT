import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
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

const _authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const _loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

authRouter.use(_authRateLimiter);

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
  _loginRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await registerLocal(parsed.data);
      res.status(201).json({
        message: 'Registration successful. Please verify your email.',
        userId: result.userId,
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
  _loginRateLimiter,
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
  _loginRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await forgotPassword(parsed.data.email);
      res.status(200).json({
        message: 'If that email is registered, a reset link has been sent.',
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
