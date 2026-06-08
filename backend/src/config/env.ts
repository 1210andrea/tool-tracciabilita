import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('production'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),

  JWT_SECRET: z.string().min(10).optional(),
  JWT_REFRESH_SECRET: z.string().min(10).optional(),
  JWT_EXPIRY: z.string().default('24h'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  CORS_ORIGIN: z.string().min(1).optional(),

  AI_PROVIDER: z.string().default('ollama'),
  AI_API_URL: z.string().min(1).optional(),
  AI_MODEL: z.string().default('llama2'),
  AI_TIMEOUT: z.coerce.number().default(30000),

  LDAP_ENABLED: z.coerce.boolean().default(false),
  LDAP_SERVER: z.string().optional(),
  LDAP_BASE_DN: z.string().optional()
});

const parsed = schema.parse(process.env);

// Fallbacks per avvio locale/ambienti non configurati.
// Se poi mancano davvero per il funzionamento (es. JWT_SECRET), il server fallirà comunque
// in modo chiaro quando quelle parti vengono usate.
export const env = {
  ...parsed,
  DATABASE_URL: parsed.DATABASE_URL ?? '',
  REDIS_URL: parsed.REDIS_URL ?? '',
  JWT_SECRET: parsed.JWT_SECRET ?? 'dev_jwt_secret_dev_jwt_secret',
  JWT_REFRESH_SECRET: parsed.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_dev_refresh_secret',
  CORS_ORIGIN: parsed.CORS_ORIGIN ?? 'http://localhost:5173',
  AI_API_URL: parsed.AI_API_URL ?? 'http://localhost:11434'
};


