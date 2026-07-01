"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const health_1 = require("./health");
const auth_1 = require("./auth");
const cases_1 = require("./cases");
const machines_1 = require("./machines");
const categories_1 = require("./categories");
const users_1 = require("./users");
const dashboard_1 = require("./dashboard");
const stats_1 = require("./stats");
const ai_1 = require("./ai");
const spareparts_1 = require("./spareparts");
const spare_parts_magazzino_1 = require("./spare-parts-magazzino");
const operatori_1 = require("./operatori");
const problem_time_1 = require("./problem_time");
const reorders_1 = require("./reorders");
const auth_2 = require("../middleware/auth");
const aiService_1 = require("../services/aiService");
function registerRoutes(app) {
    app.use('/api', auth_1.authRoutes);
    app.use('/api/ai', ai_1.aiRoutes);
    app.use('/api/operatori', operatori_1.operatoriRoutes);
    app.use('/api/cases', cases_1.casesRoutes);
    app.use('/api/machines', machines_1.machinesRoutes);
    app.use('/api/categories', categories_1.categoriesRoutes);
    app.use('/api/users', users_1.usersRoutes);
    app.use('/api/dashboard', dashboard_1.dashboardRoutes);
    app.use('/api/stats', stats_1.statsRoutes);
    app.use('/api/stats', problem_time_1.problemTimeRoutes);
    // magazzino-ricambi va PRIMA del vecchio sparepartsRoutes per override di /api/spare-parts
    app.use('/api/spare-parts', spare_parts_magazzino_1.sparePartsMagazzinoRoutes);
    app.use('/api', spareparts_1.sparepartsRoutes);
    app.use('/api/reorders', reorders_1.reordersRoutes);
    app.post('/api/analisi-ia', auth_2.authMiddleware, async (req, res, next) => {
        try {
            const { problem_name, problem_description, solutions_tried, solutions_applied, spare_parts_used, tempo_impiego, notes } = req.body;
            if (!problem_name) {
                return res.status(400).json({ error: 'Il nome del problema è obbligatorio' });
            }
            const analysis = await (0, aiService_1.generateTechnicalAnalysis)({
                problem_name,
                problem_description,
                solutions_tried: solutions_tried || [],
                solutions_applied: solutions_applied || [],
                spare_parts_used: spare_parts_used || [],
                tempo_impiego: tempo_impiego || 0.5,
                notes
            });
            if (!analysis) {
                return res.status(503).json({ error: (0, aiService_1.formatOllamaUnavailableMessage)() });
            }
            res.json({ analysis });
        }
        catch (e) {
            next(e);
        }
    });
    app.use('/', health_1.healthRoutes);
}
