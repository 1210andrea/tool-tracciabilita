"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const health_1 = require("./health");
const auth_1 = require("./auth");
const cases_1 = require("./cases");
const machines_1 = require("./machines");
const categories_1 = require("./categories");
const dashboard_1 = require("./dashboard");
const stats_1 = require("./stats");
function registerRoutes(app) {
    app.use('/api', auth_1.authRoutes);
    app.use('/api/cases', cases_1.casesRoutes);
    app.use('/api/machines', machines_1.machinesRoutes);
    app.use('/api/categories', categories_1.categoriesRoutes);
    app.use('/api/dashboard', dashboard_1.dashboardRoutes);
    app.use('/api/stats', stats_1.statsRoutes);
    app.use('/', health_1.healthRoutes);
}
