import type { Consumer } from 'kafkajs';
import { kafka } from '../kafka';
import { Topics } from '../types';

const SUBSCRIPTIONS = [Topics.ApplicationCreated, Topics.StatusChanged, Topics.InterviewScheduled];

export async function startEmailConsumer(): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId: 'email-service' });
  await consumer.connect();
  await consumer.subscribe({ topics: SUBSCRIPTIONS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const payload = message.value?.toString() ?? '<empty>';
      // Step 7 will replace this with real email rendering + SMTP delivery.
      // eslint-disable-next-line no-console
      console.log(`[email-service] received ${topic} (p${partition}): ${payload.slice(0, 120)}…`);
    },
  });

  return consumer;
}
