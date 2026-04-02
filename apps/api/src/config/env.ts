import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_CHANNEL_ID: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  SSE_SECRET: z.string().min(32, 'SSE_SECRET must be at least 32 characters').default('sse-default-dev-secret-change-in-prod-32chars!!'),
});

function loadEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\nInvalid environment variables:\n${formatted}\n`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof EnvSchema>;
