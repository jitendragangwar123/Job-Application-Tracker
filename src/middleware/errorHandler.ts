import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../services/errors';
import { logger } from '../logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const log = req.log ?? logger;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Validation failed', details: err.issues },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) log.error({ err }, err.message);
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Unknown — log full error server-side, return generic message to client.
  log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
