import type { Consumer } from 'kafkajs';
import { kafka } from '../kafka';
import { ALL_TOPICS } from '../types';
import { prisma } from '../../db/prisma';
import { logger } from '../../logger';

const log = logger.child({ consumer: 'analytics-service' });

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
        log.error({ err, topic }, 'failed to persist event');
      }
    },
  });

  return consumer;
}
