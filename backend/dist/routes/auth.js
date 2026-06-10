"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const env_1 = require("../config/env");
const db_1 = require("../db");
const ldapService_1 = require("../services/ldapService");
const auth_1 = require("../middleware/auth");
exports.authRoutes = (0, express_1.Router)();
exports.authRoutes.post('/auth/register', async (req, res, next) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'username/password required' });
        const password_hash = await bcryptjs_1.default.hash(password, 10);
        await db_1.pool.query('INSERT INTO users(username,password_hash,role,ldap_managed) VALUES($1,$2,$3,false) ON CONFLICT(username) DO NOTHING', [username, password_hash, role ?? 'user']);
        return res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
exports.authRoutes.post('/auth/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'username/password required' });
        // logging minimo per correlare i 500 durante login
        // (senza leak di password)
        // eslint-disable-next-line no-console
        console.log('[auth/login] attempt', { username });
        if (!env_1.env.JWT_SECRET || env_1.env.JWT_SECRET.length < 10) {
            // Errore di configurazione server-side: meglio farlo emergere chiaramente
            return res.status(500).json({ error: 'Server misconfigured (JWT_SECRET missing)' });
        }
        if (env_1.env.LDAP_ENABLED) {
            const ldap = new ldapService_1.LDAPService();
            try {
                await ldap.authenticate(username, password);
                // get or create user
                const r = await db_1.pool.query('SELECT id, role FROM users WHERE username=$1', [username]);
                let userId;
                let role;
                if (r.rows.length) {
                    userId = r.rows[0].id;
                    role = r.rows[0].role;
                }
                else {
                    const inserted = await db_1.pool.query('INSERT INTO users(username,password_hash,role,ldap_managed) VALUES($1,$2,$3,true) RETURNING id, role', [username, await bcryptjs_1.default.hash('ldap-placeholder', 10), 'user']);
                    userId = inserted.rows[0].id;
                    role = inserted.rows[0].role;
                }
                const token = jsonwebtoken_1.default.sign({ id: userId, role }, env_1.env.JWT_SECRET, { expiresIn: env_1.env.JWT_EXPIRY });
                return res.json({ token, role });
            }
            catch {
                // fallback to local
            }
        }
        const r = await db_1.pool.query('SELECT id, role, password_hash FROM users WHERE username=$1', [username]);
        if (!r.rows.length)
            return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcryptjs_1.default.compare(password, r.rows[0].password_hash);
        if (!ok)
            return res.status(401).json({ error: 'Invalid credentials' });
        const token = jsonwebtoken_1.default.sign({ id: r.rows[0].id, role: r.rows[0].role }, env_1.env.JWT_SECRET, { expiresIn: env_1.env.JWT_EXPIRY });
        return res.json({ token, role: r.rows[0].role });
    }
    catch (e) {
        const msg = String(e?.message ?? '');
        // Log dettagliato per capire la causa del 500
        // eslint-disable-next-line no-console
        console.error('[auth/login] failed', { username: req.body?.username ?? undefined, msg, name: e?.name, stack: e?.stack });
        // Errori prevedibili vengono convertiti in risposta 401 invece che 500
        if (/invalid|credentials|bcrypt|hash|jwt/i.test(msg)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        return next(e);
    }
});
exports.authRoutes.get('/auth/me', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const r = await db_1.pool.query(`SELECT u.id, u.role, u.username, u.operator_category_id, c.name AS operator_name
       FROM users u
       LEFT JOIN categories c ON c.id = u.operator_category_id
       WHERE u.id = $1`, [req.user.id]);
        if (!r.rows.length)
            return res.status(404).json({ error: 'User not found' });
        let operator_category_id = r.rows[0].operator_category_id;
        let operator_name = r.rows[0].operator_name;
        if (!operator_category_id) {
            const match = await db_1.pool.query(`SELECT id, name FROM categories
         WHERE type = 'operator' AND LOWER(name) = LOWER($1)
         LIMIT 1`, [r.rows[0].username]);
            if (match.rows[0]) {
                operator_category_id = match.rows[0].id;
                operator_name = match.rows[0].name;
            }
        }
        res.json({
            user: {
                id: r.rows[0].id,
                role: r.rows[0].role,
                username: r.rows[0].username,
                operator_category_id,
                operator_name
            }
        });
    }
    catch (e) {
        next(e);
    }
});
