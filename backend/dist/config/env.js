"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const schema = zod_1.z.object({
    NODE_ENV: zod_1.z.string().default('production'),
    PORT: zod_1.z.coerce.number().default(3001),
    LOG_LEVEL: zod_1.z.string().default('info'),
    DATABASE_URL: zod_1.z.string().min(1).optional(),
    REDIS_URL: zod_1.z.string().min(1).optional(),
    JWT_SECRET: zod_1.z.string().min(10).optional(),
    JWT_REFRESH_SECRET: zod_1.z.string().min(10).optional(),
    JWT_EXPIRY: zod_1.z.string().default('24h'),
    JWT_REFRESH_EXPIRY: zod_1.z.string().default('7d'),
    CORS_ORIGIN: zod_1.z.string().min(1).optional(),
    AI_PROVIDER: zod_1.z.string().default('ollama'),
    AI_API_URL: zod_1.z.string().min(1).optional(),
    AI_MODEL: zod_1.z.string().default('llama3.1:8b'),
    AI_TIMEOUT: zod_1.z.coerce.number().default(120000),
    LDAP_ENABLED: zod_1.z.coerce.boolean().default(false),
    LDAP_SERVER: zod_1.z.string().optional(),
    LDAP_BASE_DN: zod_1.z.string().optional()
});
const parsed = schema.parse(process.env);
// Fallbacks per avvio locale/ambienti non configurati.
// Se poi mancano davvero per il funzionamento (es. JWT_SECRET), il server fallirà comunque
// in modo chiaro quando quelle parti vengono usate.
exports.env = {
    ...parsed,
    DATABASE_URL: parsed.DATABASE_URL ?? '',
    REDIS_URL: parsed.REDIS_URL ?? '',
    JWT_SECRET: parsed.JWT_SECRET ?? 'dev_jwt_secret_dev_jwt_secret',
    JWT_REFRESH_SECRET: parsed.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_dev_refresh_secret',
    CORS_ORIGIN: parsed.CORS_ORIGIN ?? 'http://localhost:5173',
    AI_API_URL: parsed.AI_API_URL ?? 'http://localhost:11434'
};
