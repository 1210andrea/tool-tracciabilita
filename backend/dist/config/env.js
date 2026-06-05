"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const schema = zod_1.z.object({
    NODE_ENV: zod_1.z.string().default('production'),
    PORT: zod_1.z.coerce.number().default(3001),
    LOG_LEVEL: zod_1.z.string().default('info'),
    DATABASE_URL: zod_1.z.string().min(1),
    REDIS_URL: zod_1.z.string().min(1),
    JWT_SECRET: zod_1.z.string().min(10),
    JWT_REFRESH_SECRET: zod_1.z.string().min(10),
    JWT_EXPIRY: zod_1.z.string().default('24h'),
    JWT_REFRESH_EXPIRY: zod_1.z.string().default('7d'),
    CORS_ORIGIN: zod_1.z.string().min(1),
    AI_PROVIDER: zod_1.z.string().default('ollama'),
    AI_API_URL: zod_1.z.string().min(1),
    AI_TIMEOUT: zod_1.z.coerce.number().default(30000),
    LDAP_ENABLED: zod_1.z.coerce.boolean().default(false),
    LDAP_SERVER: zod_1.z.string().optional(),
    LDAP_BASE_DN: zod_1.z.string().optional()
});
exports.env = schema.parse(process.env);
