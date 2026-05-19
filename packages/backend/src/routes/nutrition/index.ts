/**
 * Nutrition router — endpoints de búsqueda de alimentos, registro diario,
 * recetas y plan nutricional.
 *
 * GET  /nutrition/search?q=              — búsqueda USDA (< 3 s)
 * POST /nutrition/barcode                — búsqueda por código de barras
 * GET  /nutrition/daily/:date            — RegistroDiario con comidas y food logs
 * POST /nutrition/daily/meals            — agregar comida al día
 * POST /nutrition/daily/meals/:id/foods  — agregar alimento a comida
 * DELETE /nutrition/daily/meals/:id/foods/:foodId — eliminar alimento de comida
 * GET  /nutrition/recipes                — recetas del usuario
 * POST /nutrition/recipes                — crear receta
 * GET  /nutrition/plan                   — plan nutricional activo
 * POST /nutrition/plan/generate          — generar plan nutricional
 *
 * All routes require a valid JWT (authenticate middleware applied in app.ts).
 *
 * Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import {
  searchFoods,
  searchByBarcode,
  getDailyRecord,
  addMeal,
  addFoodToMeal,
  removeFoodFromMeal,
  getRecipes,
  createRecipe,
  generateNutritionPlan,
  getActivePlan,
  type MealType,
} from '../../services/nutrition.service.js';

// ── Router ────────────────────────────────────────────────────────────────────

export const nutritionRouter = Router();

// ── Input validation schemas ──────────────────────────────────────────────────

const searchQuerySchema = z.object({
  q: z.string().min(1, 'El parámetro q es requerido.').max(200),
});

const barcodeSchema = z.object({
  barcode: z.string().min(1, 'El código de barras es requerido.'),
});

const addMealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD.'),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
});

const addFoodToMealSchema = z.object({
  foodId: z.string().uuid('foodId debe ser un UUID válido.'),
  quantityG: z.number().positive('La cantidad debe ser mayor a 0.'),
});

const createRecipeSchema = z.object({
  name: z.string().min(1, 'El nombre de la receta es requerido.').max(255),
  ingredients: z
    .array(
      z.object({
        foodId: z.string().uuid('foodId debe ser un UUID válido.'),
        quantityG: z.number().positive('La cantidad debe ser mayor a 0.'),
      }),
    )
    .min(1, 'La receta debe tener al menos un ingrediente.'),
});

// ── Helper: wrap async route handlers ────────────────────────────────────────

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

// ── GET /nutrition/search?q= ──────────────────────────────────────────────────

/**
 * Search foods by name using the USDA FoodData Central API.
 * Results are cached locally for subsequent requests.
 *
 * Query params:
 *   q — search term (required)
 *
 * Requirements: 6.1, 14.4
 */
nutritionRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'El parámetro de búsqueda es inválido.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const foods = await searchFoods(parsed.data.q);
    res.status(200).json(foods);
  }),
);

// ── POST /nutrition/barcode ───────────────────────────────────────────────────

/**
 * Search a food by barcode (GTIN/UPC).
 *
 * Body:
 *   barcode — the barcode string to look up
 *
 * Requirements: 6.2
 */
nutritionRouter.post(
  '/barcode',
  asyncHandler(async (req, res) => {
    const parsed = barcodeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'El código de barras es inválido.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const food = await searchByBarcode(parsed.data.barcode);

    if (!food) {
      res.status(404).json({
        error: 'Not found',
        message: 'No se encontró ningún alimento con ese código de barras.',
        code: 'FOOD_NOT_FOUND',
      });
      return;
    }

    res.status(200).json(food);
  }),
);

// ── GET /nutrition/daily/:date ────────────────────────────────────────────────

/**
 * Get or create the daily nutritional record for the authenticated user
 * on the given date. Includes all meals and their food logs.
 *
 * Path params:
 *   date — ISO date string (YYYY-MM-DD)
 *
 * Requirements: 6.4
 */
nutritionRouter.get(
  '/daily/:date',
  asyncHandler(async (req, res) => {
    const date = req.params['date'] as string;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'La fecha debe tener formato YYYY-MM-DD.',
        code: 'INVALID_DATE',
      });
      return;
    }

    const record = await getDailyRecord(req.userId, date);
    res.status(200).json(record);
  }),
);

// ── POST /nutrition/daily/meals ───────────────────────────────────────────────

/**
 * Add a new meal to the daily record for the authenticated user.
 * Creates the daily record if it doesn't exist yet.
 *
 * Body:
 *   date     — ISO date string (YYYY-MM-DD)
 *   mealType — BREAKFAST | LUNCH | DINNER | SNACK
 *
 * Requirements: 6.4
 */
nutritionRouter.post(
  '/daily/meals',
  asyncHandler(async (req, res) => {
    const parsed = addMealSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const meal = await addMeal(req.userId, parsed.data.date, parsed.data.mealType as MealType);
    res.status(201).json(meal);
  }),
);

// ── POST /nutrition/daily/meals/:id/foods ─────────────────────────────────────

/**
 * Add a food to a meal. Calculates macros based on quantity and updates
 * the daily record totals in real time.
 *
 * Path params:
 *   id — meal UUID
 *
 * Body:
 *   foodId    — UUID of the food to add
 *   quantityG — quantity in grams
 *
 * Requirements: 6.4
 */
nutritionRouter.post(
  '/daily/meals/:id/foods',
  asyncHandler(async (req, res) => {
    const mealId = req.params['id'] as string;

    const parsed = addFoodToMealSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const foodLog = await addFoodToMeal(mealId, parsed.data.foodId, parsed.data.quantityG);
      res.status(201).json(foodLog);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'FOOD_NOT_FOUND') {
        res.status(404).json({
          error: 'Not found',
          message: 'Alimento no encontrado.',
          code: 'FOOD_NOT_FOUND',
        });
        return;
      }
      throw err;
    }
  }),
);

// ── DELETE /nutrition/daily/meals/:id/foods/:foodId ───────────────────────────

/**
 * Remove a food log from a meal. Updates daily record totals in real time.
 *
 * Path params:
 *   id     — meal UUID
 *   foodId — food_log UUID (not the food UUID)
 *
 * Requirements: 6.4
 */
nutritionRouter.delete(
  '/daily/meals/:id/foods/:foodId',
  asyncHandler(async (req, res) => {
    const mealId = req.params['id'] as string;
    const foodLogId = req.params['foodId'] as string;

    try {
      await removeFoodFromMeal(mealId, foodLogId);
      res.status(204).send();
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'FOOD_LOG_NOT_FOUND') {
        res.status(404).json({
          error: 'Not found',
          message: 'Registro de alimento no encontrado.',
          code: 'FOOD_LOG_NOT_FOUND',
        });
        return;
      }
      throw err;
    }
  }),
);

// ── GET /nutrition/recipes ────────────────────────────────────────────────────

/**
 * Returns all recipes for the authenticated user, including their ingredients.
 *
 * Requirements: 6.5
 */
nutritionRouter.get(
  '/recipes',
  asyncHandler(async (req, res) => {
    const recipes = await getRecipes(req.userId);
    res.status(200).json(recipes);
  }),
);

// ── POST /nutrition/recipes ───────────────────────────────────────────────────

/**
 * Create a new recipe for the authenticated user.
 * Calculates total macros from ingredients and their quantities.
 *
 * Body:
 *   name        — recipe name
 *   ingredients — array of { foodId, quantityG }
 *
 * Requirements: 6.5, 6.6
 */
nutritionRouter.post(
  '/recipes',
  asyncHandler(async (req, res) => {
    const parsed = createRecipeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const recipe = await createRecipe(
        req.userId,
        parsed.data.name,
        parsed.data.ingredients,
      );
      res.status(201).json(recipe);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'FOOD_NOT_FOUND') {
        res.status(404).json({
          error: 'Not found',
          message: (err as Error).message,
          code: 'FOOD_NOT_FOUND',
        });
        return;
      }
      throw err;
    }
  }),
);

// ── GET /nutrition/plan ───────────────────────────────────────────────────────

/**
 * Returns the active nutrition plan for the authenticated user.
 *
 * Requirements: 7.1
 */
nutritionRouter.get(
  '/plan',
  asyncHandler(async (req, res) => {
    const plan = await getActivePlan(req.userId);

    if (!plan) {
      res.status(404).json({
        error: 'Not found',
        message: 'No hay un plan nutricional activo. Usa POST /nutrition/plan/generate para crear uno.',
        code: 'PLAN_NOT_FOUND',
      });
      return;
    }

    res.status(200).json(plan);
  }),
);

// ── POST /nutrition/plan/generate ────────────────────────────────────────────

/**
 * Generate a new nutrition plan for the authenticated user based on their
 * profile (TDEE, weight, goal). Deactivates any existing active plan.
 *
 * Requirements: 7.1, 7.2, 7.3
 */
nutritionRouter.post(
  '/plan/generate',
  asyncHandler(async (req, res) => {
    try {
      const plan = await generateNutritionPlan(req.userId);
      res.status(201).json(plan);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'INCOMPLETE_PROFILE') {
        res.status(422).json({
          error: 'Unprocessable Entity',
          message: (err as Error).message,
          code: 'INCOMPLETE_PROFILE',
        });
        return;
      }
      throw err;
    }
  }),
);
