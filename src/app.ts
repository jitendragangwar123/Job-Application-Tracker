import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import authRouter from './routes/auth';
import applicationsRouter from './routes/applications';
import companiesRouter from './routes/companies';
import contactsRouter from './routes/contacts';
import resumesRouter from './routes/resumes';
import jobsRouter from './routes/jobs';
import dashboardRouter from './routes/dashboard';
import observabilityRouter from './routes/observability';
import { requestContext } from './middleware/requestContext';
import { metricsMiddleware } from './middleware/metrics';
import { errorHandler } from './middleware/errorHandler';
import { env } from './config/env';

export function createApp() {
  const app = express();

  // Request-ID + structured request log (must come before anything that throws).
  app.use(requestContext);

  // Security + CORS. Dev reflects request origin so the Step F1 Next.js app at
  // :3001 works without further config; tighten via env once we go to prod.
  app.use(helmet());
  app.use(cors({ origin: env.nodeEnv === 'production' ? false : true, credentials: true }));

  app.use(express.json({ limit: '1mb' }));
  app.use(metricsMiddleware);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });
  app.use('/', observabilityRouter); // /ready + /metrics

  app.use('/auth', authRouter);
  app.use('/applications', applicationsRouter);
  app.use('/companies', companiesRouter);
  app.use('/contacts', contactsRouter);
  app.use('/resumes', resumesRouter);
  app.use('/jobs', jobsRouter);
  app.use('/dashboard', dashboardRouter);

  // Error handler must be the last middleware.
  app.use(errorHandler);

  return app;
}
