"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const socket_io_1 = require("socket.io");
const redis_1 = require("redis");
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const routes_1 = require("./routes");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: '1mb' }));
app.use((0, cors_1.default)({
    origin: env_1.env.CORS_ORIGIN,
    credentials: true
}));
app.use((0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
}));
app.use((req, _res, next) => {
    logger_1.logger.info({ req: { method: req.method, path: req.path, ip: req.ip } });
    next();
});
// Health & metrics
app.get('/health', async (_req, res) => {
    const health = { status: 'OK', timestamp: new Date().toISOString(), database: 'checking...', redis: 'checking...', ai: 'checking...' };
    try {
        const { pool } = await Promise.resolve().then(() => __importStar(require('./services/dbService')));
        await pool.query('SELECT 1');
        health.database = 'OK';
    }
    catch {
        health.database = 'FAILED';
    }
    try {
        const redis = (0, redis_1.createClient)({ url: env_1.env.REDIS_URL });
        await redis.connect();
        await redis.ping();
        await redis.disconnect();
        health.redis = 'OK';
    }
    catch {
        health.redis = 'FAILED';
    }
    try {
        const { pingOllama } = await Promise.resolve().then(() => __importStar(require('./services/aiService')));
        await pingOllama();
        health.ai = 'OK';
    }
    catch {
        health.ai = 'FAILED';
    }
    const statusCode = health.database === 'OK' ? 200 : 503;
    res.status(statusCode).json(health);
});
app.get('/metrics', async (_req, res) => {
    const { register } = await Promise.resolve().then(() => __importStar(require('prom-client')));
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
});
(0, routes_1.registerRoutes)(app);
// Example protected ping
app.get('/api/me', auth_1.authMiddleware, (_req, res) => {
    res.json({ ok: true });
});
app.use(errorHandler_1.errorHandler);
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    path: '/socket.io',
    cors: { origin: env_1.env.CORS_ORIGIN, credentials: true }
});
io.on('connection', (socket) => {
    logger_1.logger.info({ socket: { connected: true, id: socket.id } });
    socket.on('join-room', ({ room }) => {
        if (room)
            socket.join(room);
    });
});
app.set('io', io);
server.listen(env_1.env.PORT, () => {
    logger_1.logger.info({ server: `listening:${env_1.env.PORT}` });
});
