"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../config/logger");
function isPgError(err) {
    return typeof err === 'object' && err !== null && 'code' in err;
}
function errorHandler(err, _req, res, _next) {
    const anyErr = err;
    logger_1.logger.error({
        err,
        message: anyErr?.message,
        stack: anyErr?.stack,
        name: anyErr?.name,
        code: anyErr?.code
    });
    if (isPgError(err)) {
        if (err.code === '42P01') {
            return res.status(503).json({
                error: 'Errore nel caricamento dati dal database. Schema incompleto: eseguire scripts/migrate-refinement.sql sul database.'
            });
        }
        if (err.code === '42703') {
            return res.status(503).json({
                error: 'Errore nel caricamento dati dal database. Colonne mancanti: eseguire scripts/migrate-refinement.sql sul database.'
            });
        }
    }
    res.status(500).json({ error: 'Internal server error' });
}
