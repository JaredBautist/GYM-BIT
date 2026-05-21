/**
 * Tests de propiedad para Sync_Service — resolución de conflictos e idempotencia.
 *
 * Propiedad 12: Para dos escrituras en conflicto, siempre prevalece la de mayor clientTimestamp
 *   Valida: Requisito 12.4
 *
 * Propiedad 13: Procesar la Cola_Offline es idempotente (procesar dos veces produce el mismo resultado)
 *   Valida: Requisito 12.3
 *
 * Requirements: 12.3, 12.4
 */

// ── Mocks externos ────────────────────────────────────────────────────────────

jest.mock('../config/env.js', () => ({
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

jest.mock('../db/pool.js', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import * as fc from 'fast-check';
import { resolveConflict, shouldSkipItem } from '../services/sync.service.js';
import type { OfflineQueueItem } from '../services/sync.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueueItem(overrides: Partial<OfflineQueueItem> = {}): OfflineQueueItem {
  return {
    id: 'item-001',
    userId: 'user-abc',
    operation: 'CREATE',
    entityType: 'session',
    entityId: 'entity-001',
    payload: { data: 'value' },
    clientTimestamp: Date.now(),
    isProcessed: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Propiedad 12: Para dos escrituras en conflicto, siempre prevalece la de mayor
// clientTimestamp (Requisito 12.4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Propiedad 12 — última escritura gana por clientTimestamp (Req 12.4)', () => {
  it('siempre prevalece la escritura con mayor clientTimestamp', () => {
    fc.assert(
      fc.property(
        // Dos timestamps distintos
        fc.integer({ min: 1_000_000, max: 9_999_999_999 }),
        fc.integer({ min: 1_000_000, max: 9_999_999_999 }),
        fc.record({ data: fc.string() }),
        fc.record({ data: fc.string() }),
        (ts1, ts2, payload1, payload2) => {
          fc.pre(ts1 !== ts2); // garantizar que son distintos

          const existing = { clientTimestamp: ts1, payload: payload1 };
          const incoming = { clientTimestamp: ts2, payload: payload2 };

          const winner = resolveConflict(existing, incoming);

          const expectedTimestamp = Math.max(ts1, ts2);
          const expectedPayload = ts2 >= ts1 ? payload2 : payload1;

          return (
            winner.clientTimestamp === expectedTimestamp &&
            winner.payload === expectedPayload
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('cuando los timestamps son iguales, prevalece el incoming (tie-break a favor del cliente)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 9_999_999_999 }),
        fc.record({ data: fc.string() }),
        fc.record({ data: fc.string() }),
        (ts, payload1, payload2) => {
          const existing = { clientTimestamp: ts, payload: payload1 };
          const incoming = { clientTimestamp: ts, payload: payload2 };

          const winner = resolveConflict(existing, incoming);

          // Con timestamps iguales, incoming >= existing → incoming gana
          return winner.payload === payload2 && winner.clientTimestamp === ts;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('el resultado siempre tiene el timestamp más alto de los dos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (ts1, ts2) => {
          const existing = { clientTimestamp: ts1, payload: { v: 'a' } };
          const incoming = { clientTimestamp: ts2, payload: { v: 'b' } };

          const winner = resolveConflict(existing, incoming);

          return winner.clientTimestamp === Math.max(ts1, ts2);
        },
      ),
      { numRuns: 300 },
    );
  });

  // Tests deterministas adicionales
  it('caso concreto: incoming más reciente gana', () => {
    const existing = { clientTimestamp: 1000, payload: { value: 'old' } };
    const incoming = { clientTimestamp: 2000, payload: { value: 'new' } };

    const winner = resolveConflict(existing, incoming);

    expect(winner.payload).toEqual({ value: 'new' });
    expect(winner.clientTimestamp).toBe(2000);
  });

  it('caso concreto: existing más reciente gana', () => {
    const existing = { clientTimestamp: 5000, payload: { value: 'newer' } };
    const incoming = { clientTimestamp: 1000, payload: { value: 'older' } };

    const winner = resolveConflict(existing, incoming);

    expect(winner.payload).toEqual({ value: 'newer' });
    expect(winner.clientTimestamp).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Propiedad 13: Procesar la Cola_Offline es idempotente (Requisito 12.3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Propiedad 13 — idempotencia de la Cola_Offline (Req 12.3)', () => {
  it('un item ya procesado siempre es ignorado (shouldSkipItem = true)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 9_999_999_999 }),
        fc.string({ minLength: 1 }),
        (ts, entityId) => {
          const processedItem = makeQueueItem({
            entityId,
            clientTimestamp: ts,
            isProcessed: true,
          });

          return shouldSkipItem(processedItem) === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('un item no procesado nunca es ignorado (shouldSkipItem = false)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 9_999_999_999 }),
        fc.string({ minLength: 1 }),
        (ts, entityId) => {
          const pendingItem = makeQueueItem({
            entityId,
            clientTimestamp: ts,
            isProcessed: false,
          });

          return shouldSkipItem(pendingItem) === false;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('la propiedad isProcessed determina completamente si se omite el item', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 1_000_000, max: 9_999_999_999 }),
        (isProcessed, ts) => {
          const item = makeQueueItem({ isProcessed, clientTimestamp: ts });
          return shouldSkipItem(item) === isProcessed;
        },
      ),
      { numRuns: 300 },
    );
  });

  // Tests deterministas
  it('caso concreto: item procesado es omitido', () => {
    const item = makeQueueItem({ isProcessed: true });
    expect(shouldSkipItem(item)).toBe(true);
  });

  it('caso concreto: item pendiente no es omitido', () => {
    const item = makeQueueItem({ isProcessed: false });
    expect(shouldSkipItem(item)).toBe(false);
  });

  it('procesar el mismo item dos veces: la segunda vez shouldSkipItem = true', () => {
    // Simula el ciclo: item pendiente → procesado → segunda llamada lo omite
    const item = makeQueueItem({ isProcessed: false });

    // Primera pasada: no se omite
    expect(shouldSkipItem(item)).toBe(false);

    // Después de procesar, el item queda marcado como procesado
    const processedItem = { ...item, isProcessed: true };

    // Segunda pasada: se omite (idempotencia)
    expect(shouldSkipItem(processedItem)).toBe(true);
  });
});
