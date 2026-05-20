/**
 * Nutrition_Service — búsqueda de alimentos, registro diario, recetas y plan nutricional.
 *
 * Responsabilidades:
 *  - Búsqueda de alimentos en USDA FoodData API con caché local (FOODS)
 *  - Búsqueda por código de barras
 *  - Gestión del RegistroDiario (DAILY_RECORDS + MEALS + FOOD_LOGS)
 *  - Actualización de totales de macros en tiempo real
 *  - Gestión de recetas (RECIPES + RECIPE_INGREDIENTS)
 *  - Generación y consulta del plan nutricional (NUTRITION_PLANS)
 *
 * Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3
 */

import { v4 as uuidv4 } from 'uuid';

import { query, withTransaction } from '../db/pool.js';
import { env } from '../config/env.js';
import type { Goal } from './profile.service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export interface FoodRow {
  id: string;
  usda_id: string | null;
  barcode: string | null;
  name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  source: string;
}

export interface FoodLogRow {
  id: string;
  meal_id: string;
  food_id: string;
  quantity_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealRow {
  id: string;
  daily_record_id: string;
  meal_type: MealType;
  logged_at: Date;
  food_logs?: FoodLogRow[];
}

export interface DailyRecordRow {
  id: string;
  user_id: string;
  record_date: string | Date;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  calorie_goal: number;
  meals?: MealRow[];
}

export interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  food_id: string;
  quantity_g: number;
}

export interface RecipeRow {
  id: string;
  user_id: string;
  name: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  created_at: Date;
  ingredients?: RecipeIngredientRow[];
}

export interface NutritionPlanRow {
  id: string;
  user_id: string;
  calorie_goal: number;
  protein_goal_g: number;
  carbs_goal_g: number;
  fat_goal_g: number;
  is_active: boolean | number;
  generated_at: Date;
}

export interface CreateRecipeIngredientInput {
  foodId: string;
  quantityG: number;
}

// ── USDA FoodData API types ───────────────────────────────────────────────────

interface UsdaFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
  unitName: string;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  foodNutrients: UsdaFoodNutrient[];
  gtinUpc?: string;
}

interface UsdaSearchResponse {
  foods: UsdaFood[];
  totalHits: number;
}

// USDA nutrient IDs for the macros we care about
const USDA_NUTRIENT_IDS = {
  ENERGY_KCAL: 1008,
  PROTEIN: 1003,
  CARBS: 1005,
  FAT: 1004,
} as const;

// ── Pure calculation functions (exported for testing) ─────────────────────────

/**
 * Calculate the daily caloric goal based on TDEE and user goal.
 *
 * LOSE_WEIGHT:  objetivo_kcal = TDEE − 400
 * GAIN_MUSCLE:  objetivo_kcal = TDEE + 300
 * GAIN_WEIGHT:  objetivo_kcal = TDEE + 300
 * MAINTENANCE:  objetivo_kcal = TDEE
 * ENDURANCE:    objetivo_kcal = TDEE
 *
 * Requirements: 7.1
 */
export function calculateCaloricGoal(tdee: number, goal: Goal): number {
  switch (goal) {
    case 'LOSE_WEIGHT':
      return Math.round(tdee - 400);
    case 'GAIN_MUSCLE':
      return Math.round(tdee + 300);
    case 'GAIN_WEIGHT':
      return Math.round(tdee + 300);
    case 'MAINTENANCE':
      return Math.round(tdee);
    case 'ENDURANCE':
      return Math.round(tdee);
  }
}

export interface MacroGoals {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Calculate macro distribution based on caloric goal, body weight and user goal.
 *
 * GAIN_MUSCLE:
 *   proteínas = 1.9 g/kg × peso_kg
 *   grasas     = 0.25 × objetivo_kcal / 9
 *   carbos     = (objetivo_kcal − proteínas×4 − grasas×9) / 4
 *
 * LOSE_WEIGHT:
 *   proteínas = 1.4 g/kg × peso_kg
 *   grasas     = 0.25 × objetivo_kcal / 9
 *   carbos     = (objetivo_kcal − proteínas×4 − grasas×9) / 4
 *
 * Others: same as GAIN_MUSCLE formula (1.9 g/kg)
 *
 * Requirements: 7.2
 */
export function calculateMacros(
  caloricGoal: number,
  weightKg: number,
  goal: Goal,
): MacroGoals {
  const proteinPerKg = goal === 'LOSE_WEIGHT' ? 1.4 : 1.9;
  const proteinG = Math.round(proteinPerKg * weightKg * 10) / 10;
  const fatG = Math.round((0.25 * caloricGoal) / 9 * 10) / 10;
  const carbsG = Math.round(((caloricGoal - proteinG * 4 - fatG * 9) / 4) * 10) / 10;

  return {
    proteinG,
    carbsG: Math.max(0, carbsG),
    fatG,
  };
}

// ── USDA helpers ──────────────────────────────────────────────────────────────

/**
 * Extract a nutrient value from a USDA food's nutrient list by nutrient ID.
 */
function extractNutrient(nutrients: UsdaFoodNutrient[], nutrientId: number): number {
  const nutrient = nutrients.find((n) => n.nutrientId === nutrientId);
  return nutrient?.value ?? 0;
}

/**
 * Map a USDA food object to a FoodRow-compatible shape for DB insertion.
 */
function mapUsdaFoodToRow(
  usdaFood: UsdaFood,
): Omit<FoodRow, 'id'> {
  return {
    usda_id: String(usdaFood.fdcId),
    barcode: usdaFood.gtinUpc ?? null,
    name: usdaFood.description,
    calories_per_100g: extractNutrient(usdaFood.foodNutrients, USDA_NUTRIENT_IDS.ENERGY_KCAL),
    protein_per_100g: extractNutrient(usdaFood.foodNutrients, USDA_NUTRIENT_IDS.PROTEIN),
    carbs_per_100g: extractNutrient(usdaFood.foodNutrients, USDA_NUTRIENT_IDS.CARBS),
    fat_per_100g: extractNutrient(usdaFood.foodNutrients, USDA_NUTRIENT_IDS.FAT),
    source: 'USDA',
  };
}

/**
 * Upsert a food into the local FOODS table (cache).
 * Uses usda_id as the unique key.
 */
async function upsertFood(food: Omit<FoodRow, 'id'>): Promise<FoodRow> {
  // Check if already cached
  if (food.usda_id) {
    const existing = await query<FoodRow>(
      'SELECT * FROM foods WHERE usda_id = ?',
      [food.usda_id],
    );
    if (existing.length > 0) {
      return existing[0]!;
    }
  }

  const id = uuidv4();
  await query(
    `INSERT INTO foods (id, usda_id, barcode, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      food.usda_id,
      food.barcode,
      food.name,
      food.calories_per_100g,
      food.protein_per_100g,
      food.carbs_per_100g,
      food.fat_per_100g,
      food.source,
    ],
  );

  const rows = await query<FoodRow>('SELECT * FROM foods WHERE id = ?', [id]);
  return rows[0]!;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Search foods by name using the USDA FoodData Central API.
 * Results are cached in the local FOODS table.
 * Returns up to 25 results.
 *
 * Requirements: 6.1, 14.4
 */
export async function searchFoods(queryStr: string): Promise<FoodRow[]> {
  // First check local cache
  const cached = await query<FoodRow>(
    `SELECT * FROM foods WHERE MATCH(name) AGAINST(? IN BOOLEAN MODE) LIMIT 25`,
    [queryStr + '*'],
  );

  if (cached.length > 0) {
    return cached;
  }

  // Call USDA FoodData Central API
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', env.USDA_API_KEY);
  url.searchParams.set('query', queryStr);
  url.searchParams.set('pageSize', '25');
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Branded');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw Object.assign(
      new Error(`USDA API error: ${response.status} ${response.statusText}`),
      { code: 'USDA_API_ERROR' },
    );
  }

  const data = (await response.json()) as UsdaSearchResponse;

  if (!data.foods || data.foods.length === 0) {
    return [];
  }

  // Cache results in local DB
  const foods: FoodRow[] = [];
  for (const usdaFood of data.foods) {
    const mapped = mapUsdaFoodToRow(usdaFood);
    const saved = await upsertFood(mapped);
    foods.push(saved);
  }

  return foods;
}

/**
 * Search a food by barcode (GTIN/UPC).
 * Queries the local FOODS table first; if not found, queries USDA by barcode.
 *
 * Requirements: 6.2
 */
export async function searchByBarcode(barcode: string): Promise<FoodRow | null> {
  // Check local cache first
  const local = await query<FoodRow>(
    'SELECT * FROM foods WHERE barcode = ? LIMIT 1',
    [barcode],
  );

  if (local.length > 0) {
    return local[0]!;
  }

  // Query USDA by GTIN/UPC
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', env.USDA_API_KEY);
  url.searchParams.set('query', barcode);
  url.searchParams.set('pageSize', '1');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw Object.assign(
      new Error(`USDA API error: ${response.status} ${response.statusText}`),
      { code: 'USDA_API_ERROR' },
    );
  }

  const data = (await response.json()) as UsdaSearchResponse;

  if (!data.foods || data.foods.length === 0) {
    return null;
  }

  // Find the food with matching GTIN/UPC
  const match = data.foods.find((f) => f.gtinUpc === barcode) ?? data.foods[0]!;
  const mapped = mapUsdaFoodToRow(match);
  // Ensure barcode is set
  mapped.barcode = barcode;

  return upsertFood(mapped);
}

/**
 * Get or create the DAILY_RECORDS row for a user on a given date.
 * Includes all meals and their food logs.
 *
 * Requirements: 6.4
 */
export async function getDailyRecord(
  userId: string,
  date: string, // YYYY-MM-DD
): Promise<DailyRecordRow> {
  // Try to find existing record
  let records = await query<DailyRecordRow>(
    'SELECT * FROM daily_records WHERE user_id = ? AND record_date = ?',
    [userId, date],
  );

  if (records.length === 0) {
    // Get calorie goal from active nutrition plan (if any)
    const plans = await query<NutritionPlanRow>(
      'SELECT * FROM nutrition_plans WHERE user_id = ? AND is_active = TRUE LIMIT 1',
      [userId],
    );
    const calorieGoal = plans[0]?.calorie_goal ?? 0;

    const id = uuidv4();
    await query(
      `INSERT INTO daily_records (id, user_id, record_date, total_calories, total_protein, total_carbs, total_fat, calorie_goal)
       VALUES (?, ?, ?, 0, 0, 0, 0, ?)`,
      [id, userId, date, calorieGoal],
    );

    records = await query<DailyRecordRow>(
      'SELECT * FROM daily_records WHERE id = ?',
      [id],
    );
  }

  const record = records[0]!;

  // Fetch meals with food logs
  const meals = await query<MealRow>(
    'SELECT * FROM meals WHERE daily_record_id = ? ORDER BY logged_at',
    [record.id],
  );

  const mealsWithLogs: MealRow[] = await Promise.all(
    meals.map(async (meal) => {
      const foodLogs = await query<FoodLogRow>(
        'SELECT * FROM food_logs WHERE meal_id = ?',
        [meal.id],
      );
      return { ...meal, food_logs: foodLogs };
    }),
  );

  return { ...record, meals: mealsWithLogs };
}

/**
 * Add a new meal to the daily record for a user on a given date.
 * Creates the daily record if it doesn't exist.
 *
 * Requirements: 6.4
 */
export async function addMeal(
  userId: string,
  date: string,
  mealType: MealType,
): Promise<MealRow> {
  const record = await getDailyRecord(userId, date);

  const mealId = uuidv4();
  await query(
    `INSERT INTO meals (id, daily_record_id, meal_type, logged_at)
     VALUES (?, ?, ?, NOW())`,
    [mealId, record.id, mealType],
  );

  const rows = await query<MealRow>(
    'SELECT * FROM meals WHERE id = ?',
    [mealId],
  );

  return { ...rows[0]!, food_logs: [] };
}

/**
 * Recalculate and update the DAILY_RECORDS totals for the record that
 * contains the given meal.
 */
async function recalculateDailyTotals(mealId: string): Promise<void> {
  // Get the daily_record_id for this meal
  const meals = await query<{ daily_record_id: string }>(
    'SELECT daily_record_id FROM meals WHERE id = ?',
    [mealId],
  );

  if (meals.length === 0) return;

  const dailyRecordId = meals[0]!.daily_record_id;

  // Sum all food_logs for all meals in this daily record
  const totals = await query<{
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
     FROM food_logs fl
     JOIN meals m ON fl.meal_id = m.id
     WHERE m.daily_record_id = ?`,
    [dailyRecordId],
  );

  const t = totals[0]!;

  await query(
    `UPDATE daily_records
     SET total_calories = ?, total_protein = ?, total_carbs = ?, total_fat = ?
     WHERE id = ?`,
    [t.total_calories, t.total_protein, t.total_carbs, t.total_fat, dailyRecordId],
  );
}

/**
 * Add a food to a meal, calculating macros based on quantity.
 * Updates DAILY_RECORDS totals in real time.
 *
 * Requirements: 6.4
 */
export async function addFoodToMeal(
  mealId: string,
  foodId: string,
  quantityG: number,
): Promise<FoodLogRow> {
  // Fetch the food to calculate macros
  const foods = await query<FoodRow>(
    'SELECT * FROM foods WHERE id = ?',
    [foodId],
  );

  if (foods.length === 0) {
    throw Object.assign(new Error('Alimento no encontrado.'), { code: 'FOOD_NOT_FOUND' });
  }

  const food = foods[0]!;
  const factor = quantityG / 100;

  const calories = Math.round(food.calories_per_100g * factor * 100) / 100;
  const protein = Math.round(food.protein_per_100g * factor * 100) / 100;
  const carbs = Math.round(food.carbs_per_100g * factor * 100) / 100;
  const fat = Math.round(food.fat_per_100g * factor * 100) / 100;

  const logId = uuidv4();

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO food_logs (id, meal_id, food_id, quantity_g, calories, protein, carbs, fat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [logId, mealId, foodId, quantityG, calories, protein, carbs, fat],
    );
  });

  // Recalculate daily totals in real time (Requirement 6.4)
  await recalculateDailyTotals(mealId);

  const rows = await query<FoodLogRow>(
    'SELECT * FROM food_logs WHERE id = ?',
    [logId],
  );

  return rows[0]!;
}

/**
 * Remove a food log from a meal.
 * Updates DAILY_RECORDS totals in real time.
 *
 * Requirements: 6.4
 */
export async function removeFoodFromMeal(
  mealId: string,
  foodLogId: string,
): Promise<void> {
  // Verify the food log belongs to this meal
  const logs = await query<FoodLogRow>(
    'SELECT * FROM food_logs WHERE id = ? AND meal_id = ?',
    [foodLogId, mealId],
  );

  if (logs.length === 0) {
    throw Object.assign(
      new Error('Registro de alimento no encontrado.'),
      { code: 'FOOD_LOG_NOT_FOUND' },
    );
  }

  await query('DELETE FROM food_logs WHERE id = ?', [foodLogId]);

  // Recalculate daily totals in real time (Requirement 6.4)
  await recalculateDailyTotals(mealId);
}

// ── Recipes ───────────────────────────────────────────────────────────────────

/**
 * Fetch all recipes for a user, including their ingredients.
 *
 * Requirements: 6.5
 */
export async function getRecipes(userId: string): Promise<RecipeRow[]> {
  const recipes = await query<RecipeRow>(
    'SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );

  const recipesWithIngredients: RecipeRow[] = await Promise.all(
    recipes.map(async (recipe) => {
      const ingredients = await query<RecipeIngredientRow>(
        'SELECT * FROM recipe_ingredients WHERE recipe_id = ?',
        [recipe.id],
      );
      return { ...recipe, ingredients };
    }),
  );

  return recipesWithIngredients;
}

/**
 * Create a new recipe for a user.
 * Calculates total macros from ingredients and their quantities.
 *
 * Requirements: 6.5, 6.6
 */
export async function createRecipe(
  userId: string,
  name: string,
  ingredients: CreateRecipeIngredientInput[],
): Promise<RecipeRow> {
  if (ingredients.length === 0) {
    throw Object.assign(
      new Error('La receta debe tener al menos un ingrediente.'),
      { code: 'EMPTY_RECIPE' },
    );
  }

  // Fetch all foods to calculate totals
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  for (const ingredient of ingredients) {
    const foods = await query<FoodRow>(
      'SELECT * FROM foods WHERE id = ?',
      [ingredient.foodId],
    );

    if (foods.length === 0) {
      throw Object.assign(
        new Error(`Alimento con id ${ingredient.foodId} no encontrado.`),
        { code: 'FOOD_NOT_FOUND' },
      );
    }

    const food = foods[0]!;
    const factor = ingredient.quantityG / 100;

    totalCalories += food.calories_per_100g * factor;
    totalProtein += food.protein_per_100g * factor;
    totalCarbs += food.carbs_per_100g * factor;
    totalFat += food.fat_per_100g * factor;
  }

  // Round totals
  totalCalories = Math.round(totalCalories * 100) / 100;
  totalProtein = Math.round(totalProtein * 100) / 100;
  totalCarbs = Math.round(totalCarbs * 100) / 100;
  totalFat = Math.round(totalFat * 100) / 100;

  const recipeId = uuidv4();

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO recipes (id, user_id, name, total_calories, total_protein, total_carbs, total_fat, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [recipeId, userId, name, totalCalories, totalProtein, totalCarbs, totalFat],
    );

    for (const ingredient of ingredients) {
      await conn.execute(
        `INSERT INTO recipe_ingredients (id, recipe_id, food_id, quantity_g)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), recipeId, ingredient.foodId, ingredient.quantityG],
      );
    }
  });

  const rows = await query<RecipeRow>(
    'SELECT * FROM recipes WHERE id = ?',
    [recipeId],
  );

  const ingredientRows = await query<RecipeIngredientRow>(
    'SELECT * FROM recipe_ingredients WHERE recipe_id = ?',
    [recipeId],
  );

  return { ...rows[0]!, ingredients: ingredientRows };
}

// ── Nutrition plan ────────────────────────────────────────────────────────────

/**
 * Generate a nutrition plan for the user based on their profile (TDEE, weight, goal).
 * Deactivates any existing active plan and inserts a new NUTRITION_PLANS row.
 *
 * Requirements: 7.1, 7.2, 7.3
 */
export async function generateNutritionPlan(userId: string): Promise<NutritionPlanRow> {
  // Fetch user profile
  const profiles = await query<{
    tdee: number | null;
    weight_kg: number | null;
    goal: string | null;
  }>(
    'SELECT tdee, weight_kg, goal FROM profiles WHERE user_id = ?',
    [userId],
  );

  if (profiles.length === 0 || !profiles[0]!.tdee || !profiles[0]!.weight_kg || !profiles[0]!.goal) {
    throw Object.assign(
      new Error(
        'El perfil del usuario está incompleto. Se requieren TDEE, peso y objetivo para generar el plan.',
      ),
      { code: 'INCOMPLETE_PROFILE' },
    );
  }

  const { tdee, weight_kg, goal } = profiles[0]!;
  const typedGoal = goal as Goal;

  const caloricGoal = calculateCaloricGoal(tdee!, typedGoal);
  const macros = calculateMacros(caloricGoal, weight_kg!, typedGoal);

  const planId = uuidv4();

  await withTransaction(async (conn) => {
    // Deactivate existing active plans
    await conn.execute(
      'UPDATE nutrition_plans SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE',
      [userId],
    );

    // Insert new plan
    await conn.execute(
      `INSERT INTO nutrition_plans (id, user_id, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, is_active, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW())`,
      [planId, userId, caloricGoal, macros.proteinG, macros.carbsG, macros.fatG],
    );
  });

  const rows = await query<NutritionPlanRow>(
    'SELECT * FROM nutrition_plans WHERE id = ?',
    [planId],
  );

  return rows[0]!;
}

/**
 * Fetch the active nutrition plan for a user.
 * Returns null if no active plan exists.
 *
 * Requirements: 7.1
 */
export async function getActivePlan(userId: string): Promise<NutritionPlanRow | null> {
  const rows = await query<NutritionPlanRow>(
    'SELECT * FROM nutrition_plans WHERE user_id = ? AND is_active = TRUE LIMIT 1',
    [userId],
  );

  return rows[0] ?? null;
}
