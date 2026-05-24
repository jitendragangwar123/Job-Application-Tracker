import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../services/errors';
import { env } from '../config/env';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Validation failed', details: err.issues },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (env.nodeEnv !== 'production' && err instanceof Error) {
    // eslint-disable-next-line no-console
    console.error('[unhandled]', err);
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
