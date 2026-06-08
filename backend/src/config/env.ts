import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('production'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10),
  JWT_EXPIRY: z.string().default('24h'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  CORS_ORIGIN: z.string().min(1),

  AI_PROVIDER: z.string().default('ollama'),
  AI_API_URL: z.string().min(1),
  AI_MODEL: z.string().default('llama2'),
  AI_TIMEOUT: z.coerce.number().default(30000),

  LDAP_ENABLED: z.coerce.boolean().default(false),
  LDAP_SERVER: z.string().optional(),
  LDAP_BASE_DN: z.string().optional()
});

export const env = schema.parse(process.env);

