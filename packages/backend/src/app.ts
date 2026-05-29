/**
 * Express application factory.
 * Separating app creation from server startup makes testing easier.
 */

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { authenticate } from './middleware/auth.middleware.js';
import { authRouter } from './routes/auth/index.js';
import { analyticsRouter } from './routes/analytics/index.js';
import { notificationRouter } from './routes/notifications/index.js';
import { nutritionRouter } from './routes/nutrition/index.js';
import { nutritionPhotoRouter } from './routes/nutrition/photo.js';
import { profileRouter } from './routes/profile/index.js';
import { sleepRouter } from './routes/sleep/index.js';
import { syncRouter } from './routes/sync/index.js';
import { usersRouter } from './routes/users/index.js';
import { wearableRouter } from './routes/wearables/index.js';
import { workoutRouter, exercisesRouter } from './routes/workouts/index.js';

export function createApp(): express.Application {
  const app = express();

  // ── Security headers (Requirement 13.2) ──────────────────────────────────
  app.use(
    helmet({
      hsts: {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin:
        env.NODE_ENV === 'production'
          ? ['https://app.gymbit.app', 'https://www.gymbit.app']
          : true,
      credentials: true,
    }),
  );

  // ── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Compression ──────────────────────────────────────────────────────────
  app.use(compression());

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── API routes ───────────────────────────────────────────────────────────

  // Public routes — no JWT required
  app.use('/auth', authRouter);
  app.use('/exercises', exercisesRouter); // public exercise catalogue (Requirement 4.2)

  // ── JWT authentication middleware (Requirement 1.10) ─────────────────────
  // All routes mounted AFTER this line require a valid Bearer token.
  app.use(authenticate);

  // Protected routes — require valid JWT
  app.use('/profile', profileRouter);
  app.use('/workouts', workoutRouter);
  app.use('/nutrition', nutritionRouter);
  app.use('/nutrition/photo', nutritionPhotoRouter);
  app.use('/sleep', sleepRouter);
  app.use('/analytics', analyticsRouter);
  app.use('/wearables', wearableRouter);
  app.use('/notifications', notificationRouter);
  app.use('/sync', syncRouter);
  app.use('/users', usersRouter);

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ── Global error handler ─────────────────────────────────────────────────
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
}
