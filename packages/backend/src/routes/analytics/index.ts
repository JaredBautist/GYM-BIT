/**
 * Analytics router — dashboard, gráficos y exportación de reportes.
 *
 * GET  /analytics/dashboard     — resumen diario completo
 * GET  /analytics/charts/:type  — datos para gráfico específico
 * POST /analytics/export/pdf    — generar reporte PDF mensual
 *
 * Requirements: 9.1, 9.2, 9.3, 9.5, 14.3
 */

import { Router, type Request, type Response, type NextFunction } from 'express';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import {
  getDashboardSummary,
  getChartData,
  type ChartType,
} from '../../services/analytics.service.js';

export const analyticsRouter = Router();

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

const VALID_CHART_TYPES: ChartType[] = [
  'weight',
  'calories',
  'workout_heatmap',
  'prs',
  'bmi',
  'sleep',
  'macros',
  'muscle_recovery',
];

// ── GET /analytics/dashboard ──────────────────────────────────────────────────

/**
 * Resumen diario: calorías restantes, próxima sesión, sueño, hidratación, mensaje motivacional.
 * Requirements: 9.1
 */
analyticsRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const summary = await getDashboardSummary(req.userId);
    res.status(200).json(summary);
  }),
);

// ── GET /analytics/charts/:type ───────────────────────────────────────────────

/**
 * Datos para un gráfico específico.
 * Tipos válidos: weight, calories, workout_heatmap, prs, bmi, sleep, macros, muscle_recovery
 * Requirements: 9.2, 14.3
 */
analyticsRouter.get(
  '/charts/:type',
  asyncHandler(async (req, res) => {
    const chartType = req.params['type'] as string;

    if (!VALID_CHART_TYPES.includes(chartType as ChartType)) {
      res.status(400).json({
        error: 'Validation failed',
        message: `Tipo de gráfico inválido. Tipos válidos: ${VALID_CHART_TYPES.join(', ')}.`,
        code: 'INVALID_CHART_TYPE',
      });
      return;
    }

    const data = await getChartData(req.userId, chartType as ChartType);
    res.status(200).json(data);
  }),
);

// ── POST /analytics/export/pdf ────────────────────────────────────────────────

/**
 * Genera un reporte PDF mensual (< 30 s).
 * Por ahora devuelve un JSON con los datos del mes (la generación de PDF
 * se implementa en la capa de presentación o con una librería como pdfkit).
 * Requirements: 9.3
 */
analyticsRouter.post(
  '/export/pdf',
  asyncHandler(async (req, res) => {
    // Gather all chart data for the monthly report
    const [dashboard, weightData, caloriesData, workoutData, sleepData, macrosData] =
      await Promise.all([
        getDashboardSummary(req.userId),
        getChartData(req.userId, 'weight'),
        getChartData(req.userId, 'calories'),
        getChartData(req.userId, 'workout_heatmap'),
        getChartData(req.userId, 'sleep'),
        getChartData(req.userId, 'macros'),
      ]);

    const reportData = {
      generatedAt: new Date().toISOString(),
      userId: req.userId,
      period: new Date().toISOString().substring(0, 7), // YYYY-MM
      dashboard,
      charts: {
        weight: weightData,
        calories: caloriesData,
        workoutHeatmap: workoutData,
        sleep: sleepData,
        macros: macrosData,
      },
    };

    // Return JSON report data (PDF rendering is a client-side concern)
    res.status(200).json(reportData);
  }),
);
