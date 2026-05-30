import type { Consumer } from 'kafkajs';
import { kafka } from '../kafka';
import { Topics } from '../types';

const SUBSCRIPTIONS = [Topics.StatusChanged, Topics.InterviewScheduled];

export async function startNotificationsConsumer(): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId: 'notifications-service' });
  await consumer.connect();
  await consumer.subscribe({ topics: SUBSCRIPTIONS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const payload = message.value?.toString() ?? '<empty>';
      // Future: push notifications, in-app alerts.
      // eslint-disable-next-line no-console
      console.log(`[notifications-service] received ${topic}: ${payload.slice(0, 120)}…`);
    },
  });

  return consumer;
}
