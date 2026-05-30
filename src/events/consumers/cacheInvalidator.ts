import type { Consumer } from 'kafkajs';
import { kafka } from '../kafka';
import { Topics } from '../types';
import { dashboardCacheKey, del } from '../../services/cache';

const SUBSCRIPTIONS = [
  Topics.ApplicationCreated,
  Topics.StatusChanged,
  Topics.InterviewScheduled,
  Topics.FollowupDue,
];

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
        // eslint-disable-next-line no-console
        console.log(`[cache-invalidator] dropped dashboard:${userId} (${topic})`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[cache-invalidator] failed', err);
      }
    },
  });

  return consumer;
}
