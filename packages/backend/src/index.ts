/**
 * GymBit Backend — Express application entry point.
 *
 * Requirement 13.2 — HTTPS/TLS 1.2+
 *   In production, TLS is terminated at the load balancer / reverse proxy
 *   (e.g., AWS ALB, nginx), which enforces TLS 1.2+ and forwards traffic to
 *   this process over plain HTTP on the internal network.
 *
 *   For environments where Node.js must terminate TLS directly (e.g., a
 *   standalone server without a proxy), set the following environment
 *   variables and place the certificate files at the specified paths:
 *
 *     TLS_CERT_PATH=/path/to/fullchain.pem
 *     TLS_KEY_PATH=/path/to/privkey.pem
 *
 *   When both variables are present and NODE_ENV=production, this file
 *   creates an `https.Server` with `minVersion: 'TLSv1.2'` instead of the
 *   plain HTTP server.
 *
 * Requirement 14.1 — Initial load < 3 s (Express startup is fast).
 */

import fs from 'fs';
import http from 'http';
import https from 'https';

import { env } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();

// ── TLS configuration (Requirement 13.2) ─────────────────────────────────────

const tlsCertPath = process.env['TLS_CERT_PATH'];
const tlsKeyPath = process.env['TLS_KEY_PATH'];

const useTls =
  env.NODE_ENV === 'production' &&
  typeof tlsCertPath === 'string' &&
  tlsCertPath.length > 0 &&
  typeof tlsKeyPath === 'string' &&
  tlsKeyPath.length > 0;

if (useTls) {
  // Direct TLS termination in Node.js — enforces TLS 1.2 as the minimum.
  // In most production deployments this path is NOT taken because TLS is
  // handled by the load balancer; this is provided as a fallback.
  const tlsOptions: https.ServerOptions = {
    cert: fs.readFileSync(tlsCertPath as string),
    key: fs.readFileSync(tlsKeyPath as string),
    minVersion: 'TLSv1.2',
  };

  https.createServer(tlsOptions, app).listen(env.PORT, () => {
    console.log(
      `🔒 GymBit backend running on HTTPS port ${env.PORT} [${env.NODE_ENV}] (TLS ≥ 1.2)`,
    );
  });
} else {
  // Development / staging — plain HTTP (TLS handled externally in production).
  http.createServer(app).listen(env.PORT, () => {
    console.log(`🚀 GymBit backend running on port ${env.PORT} [${env.NODE_ENV}]`);
    if (env.NODE_ENV === 'production') {
      console.log(
        '   ℹ️  TLS is expected to be terminated by the upstream load balancer.',
      );
    }
  });
}
