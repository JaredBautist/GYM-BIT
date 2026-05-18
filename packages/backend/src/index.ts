/**
 * GymBit Backend — Express application entry point.
 * Requirement 13.2 — HTTPS/TLS 1.2+ enforced (handled by reverse proxy in production).
 * Requirement 14.1 — Initial load < 3 s (Express startup is fast).
 */

import { env } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`🚀 GymBit backend running on port ${env.PORT} [${env.NODE_ENV}]`);
});
