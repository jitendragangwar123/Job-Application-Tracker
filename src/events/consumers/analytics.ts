import type { Consumer } from 'kafkajs';
import { kafka } from '../kafka';
import { ALL_TOPICS } from '../types';
import { prisma } from '../../db/prisma';

export async function startAnalyticsConsumer(): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId: 'analytics-service' });
  await consumer.connect();
  await consumer.subscribe({ topics: [...ALL_TOPICS], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw) as { occurredAt: string; [k: string]: unknown };
        await prisma.event.create({
          data: {
            type: topic,
            payload: envelope as object,
            occurredAt: new Date(envelope.occurredAt ?? Date.now()),
          },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[analytics-service] failed to persist event', topic, err);
      }
    },
  });

  return consumer;
}
