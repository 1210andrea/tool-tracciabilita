"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../config/logger");
function errorHandler(err, _req, res, _next) {
    const anyErr = err;
    logger_1.logger.error({
        err,
        message: anyErr?.message,
        stack: anyErr?.stack,
        name: anyErr?.name
    });
    res.status(500).json({ error: 'Internal server error' });
}
