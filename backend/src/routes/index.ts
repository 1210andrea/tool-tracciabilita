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
import { problemTimeRoutes } from './problem_time';

export function registerRoutes(app: Express) {
  app.use('/api', authRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/cases', casesRoutes);
  app.use('/api/machines', machinesRoutes);
  app.use('/api/categories', categoriesRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/stats', problemTimeRoutes);
  app.use('/api', sparepartsRoutes);
  app.use('/', healthRoutes);
}


