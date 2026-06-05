import type { Express } from 'express';
import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { casesRoutes } from './cases';
import { machinesRoutes } from './machines';
import { categoriesRoutes } from './categories';
import { dashboardRoutes } from './dashboard';
import { statsRoutes } from './stats';

export function registerRoutes(app: Express) {
  app.use('/api', authRoutes);
  app.use('/api/cases', casesRoutes);
  app.use('/api/machines', machinesRoutes);
  app.use('/api/categories', categoriesRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/', healthRoutes);
}

