import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { redis } from './db/redis';
import { ensureBucket } from './db/s3';
import { startEvents, stopEvents } from './events';

async function main(): Promise<void> {
  await ensureBucket();
  await startEvents();

  const app = createApp();

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[job-tracker] listening on :${env.port} (${env.nodeEnv})`);
  });

  async function shutdown(signal: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[job-tracker] received ${signal}, shutting down`);
    server.close();
    await stopEvents();
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[job-tracker] failed to start', err);
  process.exit(1);
});
