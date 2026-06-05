"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../config/logger");
function errorHandler(err, _req, res, _next) {
    logger_1.logger.error({ err });
    res.status(500).json({ error: 'Internal server error' });
}
