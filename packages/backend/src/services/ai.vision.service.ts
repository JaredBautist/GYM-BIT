/**
 * AI_Vision_Service — reconocimiento de alimentos por foto usando Google Gemini Vision.
 *
 * Responsabilidades:
 *  - Enviar imagen a Google Gemini Vision API
 *  - Parsear la respuesta para extraer alimentos identificados y porciones estimadas
 *  - Subir la imagen a S3 (Object Storage)
 *  - Manejar errores de API y timeout con respuesta de fallback (array vacío)
 *
 * Requirements: 6.3
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

import { env } from '../config/env.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RecognizedFood {
  name: string;
  estimatedGrams: number;
  confidence: number;
}

// ── Gemini Vision API types ───────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

interface GeminiContent {
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// ── S3 client ─────────────────────────────────────────────────────────────────

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Upload an image buffer to S3 and return the object key.
 */
async function uploadImageToS3(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const extension = mimeType.split('/')[1] ?? 'jpg';
  const key = `nutrition/photos/${uuidv4()}.${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: imageBuffer,
      ContentType: mimeType,
    }),
  );

  return key;
}

/**
 * Parse the Gemini Vision text response to extract food items.
 *
 * Expected Gemini output format (JSON array):
 * [
 *   { "name": "Arroz blanco", "estimatedGrams": 150, "confidence": 0.92 },
 *   { "name": "Pollo a la plancha", "estimatedGrams": 120, "confidence": 0.88 }
 * ]
 *
 * Falls back to empty array if parsing fails.
 */
function parseGeminiResponse(text: string): RecognizedFood[] {
  // Try to extract a JSON array from the response text
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    const foods: RecognizedFood[] = [];

    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'estimatedGrams' in item &&
        'confidence' in item &&
        typeof (item as Record<string, unknown>).name === 'string' &&
        typeof (item as Record<string, unknown>).estimatedGrams === 'number' &&
        typeof (item as Record<string, unknown>).confidence === 'number'
      ) {
        const food = item as { name: string; estimatedGrams: number; confidence: number };
        foods.push({
          name: food.name,
          estimatedGrams: Math.max(0, food.estimatedGrams),
          confidence: Math.min(1, Math.max(0, food.confidence)),
        });
      }
    }

    return foods;
  } catch {
    return [];
  }
}

// ── Service function ──────────────────────────────────────────────────────────

/**
 * Recognize foods from a photo using Google Gemini Vision API.
 *
 * Steps:
 *  1. Upload the image to S3.
 *  2. Send the image to Gemini Vision with a structured prompt.
 *  3. Parse the response to extract food names and estimated portions.
 *  4. On API error or timeout (10 s): return empty array (fallback).
 *
 * Requirements: 6.3
 */
export async function recognizeFoodFromPhoto(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<RecognizedFood[]> {
  // 1. Upload image to S3 (fire-and-forget errors are swallowed — photo storage
  //    is best-effort and should not block the recognition response)
  try {
    await uploadImageToS3(imageBuffer, mimeType);
  } catch (uploadErr) {
    console.error('[AI_Vision_Service] S3 upload failed:', uploadErr);
    // Continue — recognition can still proceed without S3
  }

  // 2. Call Gemini Vision API with a 10-second timeout
  const base64Image = imageBuffer.toString('base64');

  const prompt = `Analyze this food image and identify all food items present.
Return ONLY a valid JSON array with no additional text, in this exact format:
[
  { "name": "<food name in Spanish>", "estimatedGrams": <number>, "confidence": <0.0-1.0> }
]
If no food is detected, return an empty array: []`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
        ],
      } satisfies GeminiContent,
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
      response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.error(
        `[AI_Vision_Service] Gemini API error: ${response.status} ${response.statusText}`,
      );
      return []; // fallback
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      console.error('[AI_Vision_Service] Gemini API returned error:', data.error.message);
      return []; // fallback
    }

    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!textContent) {
      return [];
    }

    return parseGeminiResponse(textContent);
  } catch (err) {
    // Covers: AbortError (timeout), network errors, JSON parse errors
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[AI_Vision_Service] Gemini API request timed out after 10 s');
    } else {
      console.error('[AI_Vision_Service] Unexpected error calling Gemini API:', err);
    }
    return []; // fallback (Requirement 6.3)
  }
}
