/**
 * Repositorio de nutrición en SQLite local.
 * Gestiona caché de alimentos, registros diarios y food logs offline.
 *
 * Requirements: 12.1, 6.7
 */

import { v4 as uuidv4 } from 'uuid';

import { dbQuery, dbRun, dbTransaction } from '../database';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalFood {
  id: string;
  usdaId: string | null;
  barcode: string | null;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: string;
  cachedAt: number;
}

export interface LocalDailyRecord {
  id: string;
  userId: string;
  recordDate: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  calorieGoal: number;
  isSynced: number;
}

export interface LocalFoodLog {
  id: string;
  mealId: string;
  foodId: string;
  quantityG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isSynced: number;
}

// ── Foods cache ───────────────────────────────────────────────────────────────

export async function searchFoodsLocal(query: string, limit = 25): Promise<LocalFood[]> {
  return dbQuery<LocalFood>(
    `SELECT * FROM foods_cache
     WHERE LOWER(name) LIKE LOWER(?)
     ORDER BY name
     LIMIT ?`,
    [`%${query}%`, limit],
  );
}

export async function getFoodByBarcode(barcode: string): Promise<LocalFood | null> {
  const rows = await dbQuery<LocalFood>(
    'SELECT * FROM foods_cache WHERE barcode = ? LIMIT 1',
    [barcode],
  );
  return rows[0] ?? null;
}

export async function cacheFoods(foods: Omit<LocalFood, 'cachedAt'>[]): Promise<void> {
  const ops = foods.map((food) => ({
    sql: `INSERT INTO foods_cache
            (id, usda_id, barcode, name, calories_per_100g, protein_per_100g,
             carbs_per_100g, fat_per_100g, source, cached_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            calories_per_100g = excluded.calories_per_100g,
            protein_per_100g = excluded.protein_per_100g,
            carbs_per_100g = excluded.carbs_per_100g,
            fat_per_100g = excluded.fat_per_100g,
            cached_at = excluded.cached_at`,
    params: [
      food.id,
      food.usdaId,
      food.barcode,
      food.name,
      food.caloriesPer100g,
      food.proteinPer100g,
      food.carbsPer100g,
      food.fatPer100g,
      food.source,
      Date.now(),
    ] as (string | number | null)[],
  }));

  await dbTransaction(ops);
}

// ── Daily records ─────────────────────────────────────────────────────────────

export async function getOrCreateDailyRecord(
  userId: string,
  date: string,
  calorieGoal = 0,
): Promise<LocalDailyRecord> {
  const existing = await dbQuery<LocalDailyRecord>(
    'SELECT * FROM daily_records_local WHERE user_id = ? AND record_date = ? LIMIT 1',
    [userId, date],
  );

  if (existing.length > 0) return existing[0]!;

  const id = uuidv4();
  await dbRun(
    `INSERT INTO daily_records_local
       (id, user_id, record_date, total_calories, total_protein, total_carbs, total_fat, calorie_goal, is_synced)
     VALUES (?, ?, ?, 0, 0, 0, 0, ?, 0)`,
    [id, userId, date, calorieGoal],
  );

  const rows = await dbQuery<LocalDailyRecord>(
    'SELECT * FROM daily_records_local WHERE id = ?',
    [id],
  );

  return rows[0]!;
}

export async function updateDailyTotals(
  userId: string,
  date: string,
): Promise<void> {
  // Recalcular totales sumando todos los food_logs del día
  const record = await getOrCreateDailyRecord(userId, date);

  const totals = await dbQuery<{
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
  }>(
    `SELECT
       COALESCE(SUM(fl.calories), 0) AS total_calories,
       COALESCE(SUM(fl.protein), 0)  AS total_protein,
       COALESCE(SUM(fl.carbs), 0)    AS total_carbs,
       COALESCE(SUM(fl.fat), 0)      AS total_fat
     FROM food_logs_local fl
     WHERE fl.meal_id IN (
       SELECT id FROM food_logs_local WHERE meal_id = fl.meal_id
     )
     AND fl.meal_id LIKE ?`,
    [`${record.id}%`],
  );

  const t = totals[0] ?? { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 };

  await dbRun(
    `UPDATE daily_records_local
     SET total_calories = ?, total_protein = ?, total_carbs = ?, total_fat = ?, is_synced = 0
     WHERE id = ?`,
    [t.total_calories, t.total_protein, t.total_carbs, t.total_fat, record.id],
  );
}

// ── Food logs ─────────────────────────────────────────────────────────────────

export async function addFoodLogLocal(
  mealId: string,
  foodId: string,
  quantityG: number,
): Promise<LocalFoodLog> {
  const food = await dbQuery<LocalFood>(
    'SELECT * FROM foods_cache WHERE id = ? LIMIT 1',
    [foodId],
  );

  if (food.length === 0) {
    throw Object.assign(
      new Error('Alimento no encontrado en caché local.'),
      { code: 'FOOD_NOT_FOUND_LOCAL' },
    );
  }

  const f = food[0]!;
  const factor = quantityG / 100;
  const id = uuidv4();

  await dbRun(
    `INSERT INTO food_logs_local (id, meal_id, food_id, quantity_g, calories, protein, carbs, fat, is_synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      mealId,
      foodId,
      quantityG,
      Math.round(f.caloriesPer100g * factor * 100) / 100,
      Math.round(f.proteinPer100g * factor * 100) / 100,
      Math.round(f.carbsPer100g * factor * 100) / 100,
      Math.round(f.fatPer100g * factor * 100) / 100,
    ],
  );

  const rows = await dbQuery<LocalFoodLog>(
    'SELECT * FROM food_logs_local WHERE id = ?',
    [id],
  );

  return rows[0]!;
}

export async function getUnsyncedFoodLogs(userId: string): Promise<LocalFoodLog[]> {
  return dbQuery<LocalFoodLog>(
    `SELECT fl.* FROM food_logs_local fl
     JOIN daily_records_local dr ON fl.meal_id LIKE dr.id || '%'
     WHERE dr.user_id = ? AND fl.is_synced = 0`,
    [userId],
  );
}
