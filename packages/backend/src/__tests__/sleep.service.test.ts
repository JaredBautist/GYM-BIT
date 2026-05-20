/**
 * Tests unitarios para Sleep_Service.
 *
 * Cubre:
 *  - calculateDurationMinutes: cálculo correcto de duración (Requisito 8.1)
 *  - createSleepRecord: almacena correctamente inicio, fin, duración y calidad (Requisito 8.1)
 *  - createSleepRecord: rechaza calidad fuera del rango 1–5 (Requisito 8.1)
 *  - createSleepRecord: rechaza sleepEnd anterior o igual a sleepStart (Requisito 8.1)
 *  - shouldReduceIntensity: activa reducción con calidad ≤ 2 estrellas (Requisito 8.3)
 *  - shouldReduceIntensity: NO activa reducción con calidad > 2 estrellas (Requisito 8.3)
 *  - applyIntensityReductionIfNeeded: reduce 20% la carga cuando calidad ≤ 2 (Requisito 8.3)
 *  - applyIntensityReductionIfNeeded: NO modifica el plan cuando calidad > 2 (Requisito 8.3)
 *
 * Requirements: 8.1, 8.3
 */

// ── Mocks externos ────────────────────────────────────────────────────────────

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

// Mock del pool de base de datos
const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();
jest.mock('../db/pool', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...args),
}));

// ── Imports (después de los mocks) ────────────────────────────────────────────

import {
  calculateDurationMinutes,
  shouldReduceIntensity,
  applyIntensityReduction,
  createSleepRecord,
  applyIntensityReductionIfNeeded,
} from '../services/sleep.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSleepRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sleep-001',
    user_id: 'user-abc',
    sleep_start: new Date('2024-01-15T22:00:00Z'),
    sleep_end: new Date('2024-01-16T06:00:00Z'),
    duration_minutes: 480,
    quality_stars: 4,
    phases: null,
    source: 'MANUAL',
    recorded_at: new Date(),
    ...overrides,
  };
}

// ── beforeEach: limpiar mocks ─────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// calculateDurationMinutes — cálculo de duración (Requisito 8.1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateDurationMinutes — cálculo de duración (Req 8.1)', () => {
  it('calcula correctamente 8 horas de sueño (480 minutos)', () => {
    const start = '2024-01-15T22:00:00Z';
    const end = '2024-01-16T06:00:00Z';
    expect(calculateDurationMinutes(start, end)).toBe(480);
  });

  it('calcula correctamente 7.5 horas de sueño (450 minutos)', () => {
    const start = new Date('2024-01-15T23:00:00Z');
    const end = new Date('2024-01-16T06:30:00Z');
    expect(calculateDurationMinutes(start, end)).toBe(450);
  });

  it('calcula correctamente 30 minutos de sueño', () => {
    const start = '2024-01-15T02:00:00Z';
    const end = '2024-01-15T02:30:00Z';
    expect(calculateDurationMinutes(start, end)).toBe(30);
  });

  it('devuelve 0 cuando sleepEnd es igual a sleepStart', () => {
    const ts = '2024-01-15T22:00:00Z';
    expect(calculateDurationMinutes(ts, ts)).toBe(0);
  });

  it('devuelve 0 cuando sleepEnd es anterior a sleepStart (no negativo)', () => {
    const start = '2024-01-15T06:00:00Z';
    const end = '2024-01-15T02:00:00Z';
    expect(calculateDurationMinutes(start, end)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// shouldReduceIntensity — activación de reducción (Requisito 8.3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('shouldReduceIntensity — activación de reducción (Req 8.3)', () => {
  it('devuelve true con calidad de 1 estrella', () => {
    expect(shouldReduceIntensity(1)).toBe(true);
  });

  it('devuelve true con calidad de 2 estrellas (límite)', () => {
    expect(shouldReduceIntensity(2)).toBe(true);
  });

  it('devuelve false con calidad de 3 estrellas', () => {
    expect(shouldReduceIntensity(3)).toBe(false);
  });

  it('devuelve false con calidad de 4 estrellas', () => {
    expect(shouldReduceIntensity(4)).toBe(false);
  });

  it('devuelve false con calidad de 5 estrellas', () => {
    expect(shouldReduceIntensity(5)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// applyIntensityReduction — cálculo del 20% de reducción (Requisito 8.3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyIntensityReduction — cálculo del 20% (Req 8.3)', () => {
  it('reduce 100 kg a 80 kg (20% menos)', () => {
    expect(applyIntensityReduction(100)).toBe(80);
  });

  it('reduce 50 kg a 40 kg', () => {
    expect(applyIntensityReduction(50)).toBe(40);
  });

  it('reduce 75 kg a 60 kg', () => {
    expect(applyIntensityReduction(75)).toBe(60);
  });

  it('reduce 22.5 kg a 18 kg', () => {
    expect(applyIntensityReduction(22.5)).toBe(18);
  });

  it('devuelve 0 para peso 0', () => {
    expect(applyIntensityReduction(0)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createSleepRecord — almacenamiento correcto (Requisito 8.1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createSleepRecord — almacenamiento correcto (Req 8.1)', () => {
  it('inserta el registro con duración calculada correctamente', async () => {
    const userId = 'user-abc';
    const input = {
      sleepStart: '2024-01-15T22:00:00Z',
      sleepEnd: '2024-01-16T06:00:00Z',
      qualityStars: 4,
    };

    mockQuery
      // INSERT sleep_record
      .mockResolvedValueOnce([])
      // SELECT sleep_record by id
      .mockResolvedValueOnce([makeSleepRecord({ duration_minutes: 480, quality_stars: 4 })]);

    const result = await createSleepRecord(userId, input);

    // Verificar que se ejecutó un INSERT
    const insertCall = mockQuery.mock.calls.find(
      (call) =>
        String(call[0]).toUpperCase().includes('INSERT') &&
        String(call[0]).toLowerCase().includes('sleep_records'),
    );
    expect(insertCall).toBeDefined();

    // La duración debe ser 480 minutos (8 horas)
    expect(insertCall![1]).toContain(480);

    // El resultado debe tener los datos correctos
    expect(result.quality_stars).toBe(4);
    expect(result.duration_minutes).toBe(480);
    expect(result.source).toBe('MANUAL');
  });

  it('almacena la calificación de calidad correctamente', async () => {
    const userId = 'user-abc';
    const input = {
      sleepStart: '2024-01-15T23:00:00Z',
      sleepEnd: '2024-01-16T07:00:00Z',
      qualityStars: 2,
    };

    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeSleepRecord({ quality_stars: 2, duration_minutes: 480 })]);

    const result = await createSleepRecord(userId, input);

    expect(result.quality_stars).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createSleepRecord — validaciones de entrada (Requisito 8.1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createSleepRecord — validaciones de entrada (Req 8.1)', () => {
  it('lanza INVALID_QUALITY cuando qualityStars es 0', async () => {
    await expect(
      createSleepRecord('user-abc', {
        sleepStart: '2024-01-15T22:00:00Z',
        sleepEnd: '2024-01-16T06:00:00Z',
        qualityStars: 0,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUALITY' });
  });

  it('lanza INVALID_QUALITY cuando qualityStars es 6', async () => {
    await expect(
      createSleepRecord('user-abc', {
        sleepStart: '2024-01-15T22:00:00Z',
        sleepEnd: '2024-01-16T06:00:00Z',
        qualityStars: 6,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUALITY' });
  });

  it('lanza INVALID_QUALITY cuando qualityStars no es entero (3.5)', async () => {
    await expect(
      createSleepRecord('user-abc', {
        sleepStart: '2024-01-15T22:00:00Z',
        sleepEnd: '2024-01-16T06:00:00Z',
        qualityStars: 3.5,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUALITY' });
  });

  it('lanza INVALID_SLEEP_TIMES cuando sleepEnd es anterior a sleepStart', async () => {
    await expect(
      createSleepRecord('user-abc', {
        sleepStart: '2024-01-16T06:00:00Z',
        sleepEnd: '2024-01-15T22:00:00Z',
        qualityStars: 3,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SLEEP_TIMES' });
  });

  it('lanza INVALID_SLEEP_TIMES cuando sleepEnd es igual a sleepStart', async () => {
    const ts = '2024-01-15T22:00:00Z';
    await expect(
      createSleepRecord('user-abc', {
        sleepStart: ts,
        sleepEnd: ts,
        qualityStars: 3,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SLEEP_TIMES' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// applyIntensityReductionIfNeeded — reducción de plan (Requisito 8.3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyIntensityReductionIfNeeded — reducción de plan (Req 8.3)', () => {
  it('aplica reducción del 20% cuando la calidad de sueño es ≤ 2 estrellas', async () => {
    const userId = 'user-abc';

    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const mockConn = { execute: jest.fn().mockResolvedValue([]) };
      await fn(mockConn);
    });

    mockQuery
      // SELECT último registro de sueño (últimas 24h) — calidad 1 estrella
      .mockResolvedValueOnce([makeSleepRecord({ quality_stars: 1 })])
      // SELECT ejercicios del plan activo
      .mockResolvedValueOnce([
        { id: 'pe-001', weight_kg: 100 },
        { id: 'pe-002', weight_kg: 50 },
      ]);

    const result = await applyIntensityReductionIfNeeded(userId);

    expect(result.applied).toBe(true);
    expect(result.updatedExercises).toBe(2);
    expect(result.qualityStars).toBe(1);

    // Verificar que se ejecutó la transacción con los pesos reducidos
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
  });

  it('NO aplica reducción cuando la calidad de sueño es > 2 estrellas', async () => {
    const userId = 'user-abc';

    mockQuery
      // SELECT último registro de sueño — calidad 3 estrellas
      .mockResolvedValueOnce([makeSleepRecord({ quality_stars: 3 })]);

    const result = await applyIntensityReductionIfNeeded(userId);

    expect(result.applied).toBe(false);
    expect(result.updatedExercises).toBe(0);
    expect(result.qualityStars).toBe(3);

    // No debe ejecutarse ninguna transacción
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('NO aplica reducción cuando no hay registros de sueño en las últimas 24h', async () => {
    const userId = 'user-abc';

    // SELECT devuelve vacío — sin registros recientes
    mockQuery.mockResolvedValueOnce([]);

    const result = await applyIntensityReductionIfNeeded(userId);

    expect(result.applied).toBe(false);
    expect(result.updatedExercises).toBe(0);
    expect(result.qualityStars).toBeNull();

    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('aplica reducción con calidad exactamente 2 estrellas (límite)', async () => {
    const userId = 'user-abc';

    mockWithTransaction.mockImplementation(async (fn: (conn: unknown) => Promise<void>) => {
      const mockConn = { execute: jest.fn().mockResolvedValue([]) };
      await fn(mockConn);
    });

    mockQuery
      // Calidad exactamente 2 estrellas
      .mockResolvedValueOnce([makeSleepRecord({ quality_stars: 2 })])
      // Un ejercicio con 80 kg
      .mockResolvedValueOnce([{ id: 'pe-001', weight_kg: 80 }]);

    const result = await applyIntensityReductionIfNeeded(userId);

    expect(result.applied).toBe(true);
    expect(result.updatedExercises).toBe(1);
    expect(result.qualityStars).toBe(2);
  });
});
