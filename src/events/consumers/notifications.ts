import type { Consumer } from 'kafkajs';
import { kafka } from '../kafka';
import { Topics } from '../types';
import { logger } from '../../logger';

const SUBSCRIPTIONS = [Topics.StatusChanged, Topics.InterviewScheduled];
const log = logger.child({ consumer: 'notifications-service' });

export async function startNotificationsConsumer(): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId: 'notifications-service' });
  await consumer.connect();
  await consumer.subscribe({ topics: SUBSCRIPTIONS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;
      log.debug({ topic, size: raw.length }, 'received event');
    },
  });

  return consumer;
}
