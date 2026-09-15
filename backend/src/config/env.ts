import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),
  JWT_SECRET: z.string().min(32).describe('JWT secret key (min 32 chars)'),
  JWT_REFRESH_SECRET: z.string().min(32).describe('JWT refresh secret (min 32 chars)'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TEMP_FILE_EXPIRY_HOURS: z.coerce.number().default(24),
  MAX_FILE_SIZE_MB: z.coerce.number().default(100),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().optional(),
  EMAIL_HOST_USER: z.string().optional(),
  EMAIL_HOST_PASSWORD: z.string().optional(),
  DEFAULT_FROM_EMAIL: z.string().email().optional(),
});

type Env = z.infer<typeof envSchema>;

let env: Env;

export function validateEnv(): Env {
  try {
    env = envSchema.parse(process.env);
    console.log('✓ Environment variables validated');
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Environment validation error:');
      error.issues.forEach(issue => {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

export function getEnv(): Env {
  if (!env) {
    validateEnv();
  }
  return env;
}

export const config = {
  isDevelopment: () => getEnv().NODE_ENV === 'development',
  isProduction: () => getEnv().NODE_ENV === 'production',
};
