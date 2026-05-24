import type { NextFunction, Request, Response } from 'express';
import { redis } from '../db/redis';
import { Errors } from '../services/errors';

interface Options {
  /** Logical name; used as the Redis key prefix. */
  name: string;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Max requests allowed in a window. */
  max: number;
  /** Derive the bucket key from the request (e.g., IP, email). */
  keyFn: (req: Request) => string | undefined;
}

export function rateLimit(opts: Options) {
  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = opts.keyFn(req);
      if (!id) return next(); // no key → skip (e.g., missing field; route validation will reject)

      const key = `ratelimit:${opts.name}:${id}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, opts.windowSeconds);
      }
      const remaining = Math.max(0, opts.max - count);
      res.setHeader('X-RateLimit-Limit', String(opts.max));
      res.setHeader('X-RateLimit-Remaining', String(remaining));

      if (count > opts.max) {
        const ttl = await redis.ttl(key);
        if (ttl > 0) res.setHeader('Retry-After', String(ttl));
        return next(Errors.rateLimited(`Too many attempts. Retry in ${ttl}s.`));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
