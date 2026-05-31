import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { redis } from './db/redis';
import { ensureBucket } from './db/s3';
import { startEvents, stopEvents } from './events';
import { startCron, stopCron } from './jobs';
import { logger } from './logger';

async function main(): Promise<void> {
  await ensureBucket();
  await startEvents();
  startCron();

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, 'http: listening');
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'shutdown: received signal');
    server.close();
    stopCron();
    await stopEvents();
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandledRejection');
  process.exit(1);
});

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
