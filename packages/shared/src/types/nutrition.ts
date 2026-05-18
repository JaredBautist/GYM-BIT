/**
 * Nutrition, food, recipe and plan types.
 */

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export interface Food {
  id: string;
  usdaId?: string;
  barcode?: string;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: string;
}

export interface Recipe {
  id: string;
  userId: string;
  name: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  createdAt: Date;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  foodId: string;
  quantityG: number;
}

export interface DailyRecord {
  id: string;
  userId: string;
  recordDate: Date;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  calorieGoal: number;
}

export interface Meal {
  id: string;
  dailyRecordId: string;
  mealType: MealType;
  loggedAt: Date;
}

export interface FoodLog {
  id: string;
  mealId: string;
  foodId: string;
  quantityG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionPlan {
  id: string;
  userId: string;
  calorieGoal: number;
  proteinGoalG: number;
  carbsGoalG: number;
  fatGoalG: number;
  isActive: boolean;
  generatedAt: Date;
}
