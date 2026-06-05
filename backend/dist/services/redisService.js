"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ioEmit = ioEmit;
const redis_1 = require("redis");
const env_1 = require("../config/env");
const client = (0, redis_1.createClient)({ url: env_1.env.REDIS_URL });
let ready = null;
async function ensureReady() {
    if (!ready)
        ready = client.connect();
    return ready;
}
async function ioEmit(_event, _payload) {
    // Minimal placeholder: in production you'd use socket.io rooms directly.
    // Kept for future expansion with Redis pub/sub.
    try {
        await ensureReady();
    }
    catch {
        // ignore
    }
}
