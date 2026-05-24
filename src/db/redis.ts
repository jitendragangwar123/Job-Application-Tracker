import Redis from 'ioredis';
import { env } from '../config/env';

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export const redis =
  global.__redis ??
  new Redis(env.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

if (env.nodeEnv !== 'production') {
  global.__redis = redis;
}
