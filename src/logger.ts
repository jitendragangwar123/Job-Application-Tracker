import pino, { type Logger } from 'pino';
import { env } from './config/env';

declare global {
  // eslint-disable-next-line no-var
  var __logger: Logger | undefined;
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
];

export const logger: Logger =
  global.__logger ??
  pino({
    level: env.logLevel,
    base: { service: 'job-tracker', env: env.nodeEnv },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
      env.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
        : undefined,
  });

if (env.nodeEnv !== 'production') {
  global.__logger = logger;
}
