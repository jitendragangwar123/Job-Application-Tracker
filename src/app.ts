import express, { Request, Response } from 'express';
import authRouter from './routes/auth';
import applicationsRouter from './routes/applications';
import companiesRouter from './routes/companies';
import contactsRouter from './routes/contacts';
import resumesRouter from './routes/resumes';
import jobsRouter from './routes/jobs';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/auth', authRouter);
  app.use('/applications', applicationsRouter);
  app.use('/companies', companiesRouter);
  app.use('/contacts', contactsRouter);
  app.use('/resumes', resumesRouter);
  app.use('/jobs', jobsRouter);

  // Error handler must be the last middleware.
  app.use(errorHandler);

  return app;
}
