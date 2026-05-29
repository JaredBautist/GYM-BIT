import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_CLIENT_ID: z.string().min(1),
  AUTH0_CLIENT_SECRET: z.string().min(1),
  AUTH0_AUDIENCE: z.string().url(),
  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  USDA_API_KEY: z.string().min(1),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(44),
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
