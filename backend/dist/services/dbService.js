"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
// Backward-compatible re-export; prefer importing from '../db'.
var db_1 = require("../db");
Object.defineProperty(exports, "pool", { enumerable: true, get: function () { return db_1.pool; } });
