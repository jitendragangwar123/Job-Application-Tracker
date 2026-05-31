import { Router } from 'express';
import { prisma } from '../db/prisma';
import { redis } from '../db/redis';
import { isProducerConnected } from '../events/kafka';
import { registry } from '../middleware/metrics';
import { logger } from '../logger';

const router = Router();

interface CheckResult {
  ok: boolean;
  durationMs: number;
  error?: string;
}

async function check(fn: () => Promise<unknown>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

router.get('/ready', async (_req, res) => {
  const [postgres, redisCheck, kafka] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => redis.ping()),
    check(async () => {
      if (!isProducerConnected()) throw new Error('producer not connected');
    }),
  ]);

  const allOk = postgres.ok && redisCheck.ok && kafka.ok;
  const body = { status: allOk ? 'ready' : 'not_ready', checks: { postgres, redis: redisCheck, kafka } };
  res.status(allOk ? 200 : 503).json(body);
});

router.get('/metrics', async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  } catch (err) {
    logger.error({ err }, 'failed to render metrics');
    next(err);
  }
});

export default router;
