/**
 * Ruta POST /nutrition/photo — reconocimiento de alimentos por foto.
 *
 * Recibe una imagen (multipart/form-data o base64 en JSON),
 * la envía a AI_Vision_Service (Google Gemini Vision) y devuelve
 * los alimentos identificados con sus porciones estimadas.
 *
 * Requirements: 6.3
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { recognizeFoodFromPhoto } from '../../services/ai.vision.service.js';

export const nutritionPhotoRouter = Router();

// ── Input validation schema ───────────────────────────────────────────────────

const photoSchema = z.object({
  // Base64-encoded image data
  imageBase64: z.string().min(1, 'imageBase64 es requerido.'),
  // MIME type of the image (e.g. "image/jpeg", "image/png")
  mimeType: z
    .string()
    .regex(/^image\/(jpeg|jpg|png|webp|heic)$/, 'mimeType debe ser image/jpeg, image/png, image/webp o image/heic.'),
});

// ── Helper ────────────────────────────────────────────────────────────────────

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthenticatedRequest, res, next).catch(next);
  };
}

// ── POST /nutrition/photo ─────────────────────────────────────────────────────

/**
 * Reconocer alimentos en una foto usando Google Gemini Vision.
 *
 * Body (JSON):
 *   imageBase64 — imagen codificada en base64
 *   mimeType    — tipo MIME de la imagen (image/jpeg | image/png | image/webp | image/heic)
 *
 * Response 200:
 *   Array de { name, estimatedGrams, confidence }
 *   Devuelve [] si no se detectan alimentos o si la API falla (fallback).
 *
 * Requirements: 6.3
 */
nutritionPhotoRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = photoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      });
      return;
    }

    const { imageBase64, mimeType } = parsed.data;

    // Decode base64 to Buffer
    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(imageBase64, 'base64');
    } catch {
      res.status(400).json({
        error: 'Validation failed',
        message: 'imageBase64 no es una cadena base64 válida.',
        code: 'INVALID_BASE64',
      });
      return;
    }

    // Validate minimum size (avoid sending empty buffers to Gemini)
    if (imageBuffer.length < 100) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'La imagen es demasiado pequeña o está vacía.',
        code: 'IMAGE_TOO_SMALL',
      });
      return;
    }

    // Call AI_Vision_Service — always returns an array (empty on failure)
    const foods = await recognizeFoodFromPhoto(imageBuffer, mimeType);

    res.status(200).json(foods);
  }),
);
