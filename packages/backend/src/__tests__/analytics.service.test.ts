/**
 * Tests unitarios para Analytics_Service.
 *
 * Cubre:
 *  - calculateCaloriesRemaining: cálculo correcto de calorías restantes (Requisito 9.1)
 *  - calculateMuscleRecovery: cálculo correcto de recuperación muscular (Requisito 9.2)
 *  - getDashboardSummary: agrega correctamente los datos del día (Requisito 9.1)
 *  - getChartData 'macros': devuelve distribución de macros del día (Requisito 9.2)
 *  - getChartData 'calories': devuelve datos de calorías de los últimos 30 días (Requisito 9.2)
 *
 * Requirements: 9.1, 9.2
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

const mockQuery = jest.fn();
jest.mock('../db/pool.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: jest.fn(),
}));

// ── Imports (después de los mocks) ────────────────────────────────────────────

import {
  calculateCaloriesRemaining,
  calculateMuscleRecovery,
  getDashboardSummary,
  getChartData,
} from '../services/analytics.service.js';

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// calculateCaloriesRemaining — cálculo de calorías restantes (Requisito 9.1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateCaloriesRemaining — calorías restantes (Req 9.1)', () => {
  it('calcula correctamente las calorías restantes', () => {
    expect(calculateCaloriesRemaining(2000, 1200)).toBe(800);
  });

  it('devuelve 0 cuando se superó el objetivo calórico', () => {
    expect(calculateCaloriesRemaining(2000, 2500)).toBe(0);
  });

  it('devuelve el objetivo completo cuando no se ha consumido nada', () => {
    expect(calculateCaloriesRemaining(2000, 0)).toBe(2000);
  });

  it('devuelve 0 exacto cuando se alcanzó el objetivo', () => {
    expect(calculateCaloriesRemaining(2000, 2000)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// calculateMuscleRecovery — recuperación muscular (Requisito 9.2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateMuscleRecovery — recuperación muscular (Req 9.2)', () => {
  it('devuelve 100% de recuperación después de 3 días de descanso', () => {
    expect(calculateMuscleRecovery(3)).toBe(100);
  });

  it('devuelve 100% de recuperación después de más de 3 días', () => {
    expect(calculateMuscleRecovery(7)).toBe(100);
  });

  it('devuelve 0% de recuperación el mismo día del entrenamiento', () => {
    expect(calculateMuscleRecovery(0)).toBe(0);
  });

  it('devuelve ~33% de recuperación después de 1 día', () => {
    expect(calculateMuscleRecovery(1)).toBe(33);
  });

  it('devuelve ~67% de recuperación después de 2 días', () => {
    expect(calculateMuscleRecovery(2)).toBe(67);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getDashboardSummary — resumen diario (Requisito 9.1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('getDashboardSummary — resumen diario (Req 9.1)', () => {
  it('calcula correctamente las calorías restantes del día', async () => {
    const userId = 'user-abc';

    mockQuery
      // 1. SELECT daily_records (calorías del día)
      .mockResolvedValueOnce([{ total_calories: 1500, calorie_goal: 2200 }])
      // 2. SELECT próxima sesión
      .mockResolvedValueOnce([{ plan_type: 'FULL_BODY', focus: 'Full Body' }])
      // 3. SELECT último sueño
      .mockResolvedValueOnce([{ duration_minutes: 480, quality_stars: 4 }]);

    const summary = await getDashboardSummary(userId);

    expect(summary.caloriesConsumed).toBe(1500);
    expect(summary.calorieGoal).toBe(2200);
    expect(summary.caloriesRemaining).toBe(700);
  });

  it('devuelve calorías restantes = objetivo cuando no hay registros del día', async () => {
    const userId = 'user-abc';

    mockQuery
      // Sin registro diario
      .mockResolvedValueOnce([])
      // Sin próxima sesión
      .mockResolvedValueOnce([])
      // Sin sueño
      .mockResolvedValueOnce([]);

    const summary = await getDashboardSummary(userId);

    expect(summary.caloriesConsumed).toBe(0);
    expect(summary.calorieGoal).toBe(0);
    expect(summary.caloriesRemaining).toBe(0);
    expect(summary.nextSession).toBeNull();
    expect(summary.sleepHours).toBeNull();
  });

  it('incluye las horas de sueño de la noche anterior', async () => {
    const userId = 'user-abc';

    mockQuery
      .mockResolvedValueOnce([{ total_calories: 800, calorie_goal: 2000 }])
      .mockResolvedValueOnce([])
      // 7.5 horas = 450 minutos
      .mockResolvedValueOnce([{ duration_minutes: 450, quality_stars: 3 }]);

    const summary = await getDashboardSummary(userId);

    expect(summary.sleepHours).toBe(7.5);
    expect(summary.sleepQuality).toBe(3);
  });

  it('incluye la próxima sesión programada', async () => {
    const userId = 'user-abc';

    mockQuery
      .mockResolvedValueOnce([{ total_calories: 0, calorie_goal: 2000 }])
      .mockResolvedValueOnce([{ plan_type: 'PPL', focus: 'Push' }])
      .mockResolvedValueOnce([]);

    const summary = await getDashboardSummary(userId);

    expect(summary.nextSession).toEqual({ planType: 'PPL', focus: 'Push' });
  });

  it('incluye un mensaje motivacional no vacío', async () => {
    const userId = 'user-abc';

    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const summary = await getDashboardSummary(userId);

    expect(summary.motivationalMessage).toBeTruthy();
    expect(typeof summary.motivationalMessage).toBe('string');
    expect(summary.motivationalMessage.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getChartData 'macros' — distribución de macros (Requisito 9.2)
// ═══════════════════════════════════════════════════════════════════════════════

describe("getChartData 'macros' — distribución de macros (Req 9.2)", () => {
  it('devuelve los tres macronutrientes del día', async () => {
    const userId = 'user-abc';

    mockQuery.mockResolvedValueOnce([
      { total_protein: 150, total_carbs: 200, total_fat: 60 },
    ]);

    const data = await getChartData(userId, 'macros');

    expect(data).toHaveLength(3);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Proteínas', value: 150 }),
        expect.objectContaining({ name: 'Carbohidratos', value: 200 }),
        expect.objectContaining({ name: 'Grasas', value: 60 }),
      ]),
    );
  });

  it('devuelve ceros cuando no hay registros del día', async () => {
    const userId = 'user-abc';

    mockQuery.mockResolvedValueOnce([]);

    const data = await getChartData(userId, 'macros');

    expect(data).toHaveLength(3);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Proteínas', value: 0 }),
        expect.objectContaining({ name: 'Carbohidratos', value: 0 }),
        expect.objectContaining({ name: 'Grasas', value: 0 }),
      ]),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getChartData 'calories' — datos de calorías (Requisito 9.2)
// ═══════════════════════════════════════════════════════════════════════════════

describe("getChartData 'calories' — datos de calorías (Req 9.2)", () => {
  it('devuelve los datos de calorías con fecha y valor', async () => {
    const userId = 'user-abc';

    mockQuery.mockResolvedValueOnce([
      { record_date: '2024-01-15', total_calories: 1800, calorie_goal: 2200 },
      { record_date: '2024-01-16', total_calories: 2100, calorie_goal: 2200 },
    ]);

    const data = await getChartData(userId, 'calories');

    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ date: '2024-01-15', value: 1800 });
    expect(data[1]).toMatchObject({ date: '2024-01-16', value: 2100 });
  });

  it('devuelve array vacío cuando no hay registros', async () => {
    const userId = 'user-abc';

    mockQuery.mockResolvedValueOnce([]);

    const data = await getChartData(userId, 'calories');

    expect(data).toHaveLength(0);
  });
});
