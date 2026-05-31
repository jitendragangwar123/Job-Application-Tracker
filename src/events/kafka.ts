import { Kafka, type Producer, logLevel } from 'kafkajs';
import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { ALL_TOPICS, type AnyEvent, type Topic } from './types';

declare global {
  // eslint-disable-next-line no-var
  var __kafka: Kafka | undefined;
  // eslint-disable-next-line no-var
  var __producer: Producer | undefined;
}

export const kafka =
  global.__kafka ??
  new Kafka({
    clientId: env.kafka.clientId,
    brokers: env.kafka.brokers,
    logLevel: env.nodeEnv === 'production' ? logLevel.WARN : logLevel.ERROR,
    retry: { retries: 5, initialRetryTime: 300 },
    // 5s tolerates the first TCP handshake under Docker/macOS, which can
    // exceed the kafkajs default of 1s on cold start.
    connectionTimeout: 5000,
  });

let producer: Producer | undefined = global.__producer;

if (env.nodeEnv !== 'production') {
  global.__kafka = kafka;
}

export async function connectProducer(): Promise<void> {
  if (producer) return;
  producer = kafka.producer({ idempotent: true, allowAutoTopicCreation: false });
  await producer.connect();
  if (env.nodeEnv !== 'production') global.__producer = producer;
}

export async function disconnectProducer(): Promise<void> {
  if (!producer) return;
  await producer.disconnect();
  producer = undefined;
  if (env.nodeEnv !== 'production') global.__producer = undefined;
}

export function isProducerConnected(): boolean {
  return producer !== undefined;
}

export async function ensureTopics(): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = new Set(await admin.listTopics());
    const toCreate = ALL_TOPICS.filter((t) => !existing.has(t)).map((topic) => ({
      topic,
      numPartitions: 1,
      replicationFactor: 1,
    }));
    if (toCreate.length > 0) {
      await admin.createTopics({ topics: toCreate, waitForLeaders: true });
      // eslint-disable-next-line no-console
      console.log(`[kafka] created topics: ${toCreate.map((t) => t.topic).join(', ')}`);
    }
  } finally {
    await admin.disconnect();
  }
}

export interface PublishInput<T extends Topic = Topic> {
  type: T;
  actor: { userId: string };
  data: Extract<AnyEvent, { type: T }>['data'];
  /** Partition key — defaults to actor.userId so per-user ordering is preserved. */
  key?: string;
}

export async function publishEvent<T extends Topic>(input: PublishInput<T>): Promise<void> {
  if (!producer) throw new Error('Kafka producer not connected. Call connectProducer() first.');
  const envelope: EventEnvelope<T> = {
    id: randomUUID(),
    type: input.type,
    occurredAt: new Date().toISOString(),
    actor: input.actor,
    data: input.data as unknown,
  } as EventEnvelope<T>;

  await producer.send({
    topic: input.type,
    messages: [
      {
        key: input.key ?? input.actor.userId,
        value: JSON.stringify(envelope),
      },
    ],
  });
}

// Re-import for the generic constraint above
import type { EventEnvelope } from './types';
