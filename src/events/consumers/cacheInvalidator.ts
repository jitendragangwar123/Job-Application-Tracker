import type { Consumer } from 'kafkajs';
import { kafka } from '../kafka';
import { Topics } from '../types';
import { dashboardCacheKey, del } from '../../services/cache';
import { logger } from '../../logger';

const SUBSCRIPTIONS = [
  Topics.ApplicationCreated,
  Topics.StatusChanged,
  Topics.InterviewScheduled,
  Topics.FollowupDue,
];

const log = logger.child({ consumer: 'cache-invalidator' });

export async function startCacheInvalidator(): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId: 'cache-invalidator' });
  await consumer.connect();
  await consumer.subscribe({ topics: SUBSCRIPTIONS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw) as { actor?: { userId?: string } };
        const userId = envelope.actor?.userId;
        if (!userId) return;
        await del(dashboardCacheKey(userId));
        log.debug({ userId, topic }, 'dropped dashboard cache');
      } catch (err) {
        log.error({ err }, 'invalidator failed');
      }
    },
  });

  return consumer;
}
