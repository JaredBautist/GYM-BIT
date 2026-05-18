/**
 * Environment variable validation using Zod + dotenv.
 * Fails fast at startup if required variables are missing or malformed.
 * Requirement 13.1, 13.2
 */

import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // PostgreSQL
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection URL'),

  // Auth0
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_CLIENT_ID: z.string().min(1),
  AUTH0_CLIENT_SECRET: z.string().min(1),
  AUTH0_AUDIENCE: z.string().url(),

  // JWT key paths
  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),

  // Google Gemini
  GEMINI_API_KEY: z.string().min(1),

  // AWS S3
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),

  // USDA
  USDA_API_KEY: z.string().min(1),

  // Firebase
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1),

  // AES-256 encryption key (base64, 32 bytes → 44 base64 chars)
  ENCRYPTION_KEY: z
    .string()
    .min(44, 'ENCRYPTION_KEY must be a base64-encoded 32-byte key (≥44 chars)'),
});

function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌  Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
export type Env = typeof env;
