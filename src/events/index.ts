import type { Consumer } from 'kafkajs';
import { connectProducer, disconnectProducer, ensureTopics } from './kafka';
import { startEmailConsumer } from './consumers/email';
import { startAnalyticsConsumer } from './consumers/analytics';
import { startNotificationsConsumer } from './consumers/notifications';
import { startCacheInvalidator } from './consumers/cacheInvalidator';
import { logger } from '../logger';

let consumers: Consumer[] = [];

export async function startEvents(): Promise<void> {
  await ensureTopics();
  await connectProducer();
  consumers = await Promise.all([
    startEmailConsumer(),
    startAnalyticsConsumer(),
    startNotificationsConsumer(),
    startCacheInvalidator(),
  ]);
  logger.info({ consumers: consumers.length }, 'events: producer + consumers ready');
}

export async function stopEvents(): Promise<void> {
  await Promise.allSettled(consumers.map((c) => c.disconnect()));
  consumers = [];
  await disconnectProducer();
}

export { publishEvent } from './kafka';
