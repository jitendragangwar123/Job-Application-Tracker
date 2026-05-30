import type { Consumer } from 'kafkajs';
import { connectProducer, disconnectProducer, ensureTopics } from './kafka';
import { startEmailConsumer } from './consumers/email';
import { startAnalyticsConsumer } from './consumers/analytics';
import { startNotificationsConsumer } from './consumers/notifications';
import { startCacheInvalidator } from './consumers/cacheInvalidator';

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
  // eslint-disable-next-line no-console
  console.log(`[events] producer + ${consumers.length} consumers ready`);
}

export async function stopEvents(): Promise<void> {
  await Promise.allSettled(consumers.map((c) => c.disconnect()));
  consumers = [];
  await disconnectProducer();
}

export { publishEvent } from './kafka';
