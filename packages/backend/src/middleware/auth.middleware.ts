/**
 * Authentication middleware for the API Gateway.
 *
 * Validates RS256 JWT on every protected request, attaches `userId` (and the
 * full decoded payload) to the request context, and rejects unauthenticated
 * requests with a 401 before they reach any route handler.
 *
 * Requirements: 1.10, 13.2
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { getPublicKey } from '../services/auth.service.js';
import { env } from '../config/env.js';

// ── Augmented request type ────────────────────────────────────────────────────

/**
 * Express Request extended with the authenticated user's identity.
 * Use this type in route handlers that sit behind `authenticate`.
 */
export interface AuthenticatedRequest extends Request {
  /** UUID of the authenticated user (from JWT `sub` claim). */
  userId: string;
  /** Full decoded JWT payload — available for convenience. */
  user: {
    sub: string;
    email: string;
    iat: number;
    exp: number;
    iss?: string;
    aud?: string | string[];
    [key: string]: unknown;
  };
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Express middleware that enforces JWT authentication.
 *
 * Flow:
 *  1. Extract the Bearer token from the `Authorization` header.
 *  2. Verify the token signature (RS256) and standard claims (exp, iss, aud).
 *  3. Attach `req.userId` and `req.user` for downstream handlers.
 *  4. Call `next()` on success; respond 401 on any failure.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // 1. Extract token from "Authorization: Bearer <token>"
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Bearer token is empty.',
    });
    return;
  }

  // 2. Verify the JWT
  try {
    const publicKey = getPublicKey();

    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_AUDIENCE,
    }) as AuthenticatedRequest['user'];

    // 3. Attach identity to the request
    const authenticatedReq = req as AuthenticatedRequest;
    authenticatedReq.userId = decoded.sub;
    authenticatedReq.user = decoded;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired. Please refresh your session.',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      // Covers: invalid signature, malformed token, wrong algorithm, etc.
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token.',
        code: 'TOKEN_INVALID',
      });
      return;
    }

    // Unexpected error — let the global error handler deal with it
    next(err);
  }
}
