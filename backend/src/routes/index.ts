import type { Express } from 'express';
import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { casesRoutes } from './cases';
import { machinesRoutes } from './machines';
import { categoriesRoutes } from './categories';
import { usersRoutes } from './users';
import { dashboardRoutes } from './dashboard';
import { statsRoutes } from './stats';
import { aiRoutes } from './ai';
import { sparepartsRoutes } from './spareparts';
import { sparePartsMagazzinoRoutes } from './spare-parts-magazzino';
import { operatoriRoutes } from './operatori';
import { problemTimeRoutes } from './problem_time';
import { reordersRoutes } from './reorders';

import { authMiddleware } from '../middleware/auth';
import { generateTechnicalAnalysis, formatOllamaUnavailableMessage } from '../services/aiService';

export function registerRoutes(app: Express) {
  app.use('/api', authRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/operatori', operatoriRoutes);
  app.use('/api/cases', casesRoutes);
  app.use('/api/machines', machinesRoutes);
  app.use('/api/categories', categoriesRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/stats', problemTimeRoutes);
  // magazzino-ricambi va PRIMA del vecchio sparepartsRoutes per override di /api/spare-parts
  app.use('/api/spare-parts', sparePartsMagazzinoRoutes);
  app.use('/api', sparepartsRoutes);
  app.use('/api/reorders', reordersRoutes);

  app.post('/api/analisi-ia', authMiddleware, async (req, res, next) => {
    try {
      const {
        problem_name,
        problem_description,
        solutions_tried,
        solutions_applied,
        spare_parts_used,
        tempo_impiego,
        notes
      } = req.body as {
        problem_name?: string;
        problem_description?: string;
        solutions_tried?: string[]
        solutions_applied?: string[];
        spare_parts_used?: string[];
        tempo_impiego?: number;
        notes?: string;
      };

      if (!problem_name) {
        return res.status(400).json({ error: 'Il nome del problema è obbligatorio' });
      }

      const analysis = await generateTechnicalAnalysis({
        problem_name,
        problem_description,
        solutions_tried: solutions_tried || [],
        solutions_applied: solutions_applied || [],
        spare_parts_used: spare_parts_used || [],
        tempo_impiego: tempo_impiego || 0.5,
        notes
      });

      if (!analysis) {
        return res.status(503).json({ error: formatOllamaUnavailableMessage() });
      }

      res.json({ analysis });
    } catch (e) {
      next(e);
    }
  });

  app.use('/', healthRoutes);
}
