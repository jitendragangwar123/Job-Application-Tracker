import express, { Request, Response } from 'express';
import authRouter from './routes/auth';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/auth', authRouter);

  // Error handler must be the last middleware.
  app.use(errorHandler);

  return app;
}
