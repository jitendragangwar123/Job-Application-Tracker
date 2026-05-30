import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  nodeEnv: required('NODE_ENV', 'development'),
  port: Number(required('PORT', '3000')),
  logLevel: required('LOG_LEVEL', 'info'),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),

  jwt: {
    secret: required('JWT_SECRET'),
    accessTtl: required('JWT_ACCESS_TTL', '15m'),
    refreshTtl: required('JWT_REFRESH_TTL', '7d'),
  },

  bcryptCost: Number(required('BCRYPT_COST', '12')),

  s3: {
    endpoint: required('S3_ENDPOINT'),
    region: required('S3_REGION', 'us-east-1'),
    bucket: required('S3_BUCKET'),
    accessKey: required('S3_ACCESS_KEY'),
    secretKey: required('S3_SECRET_KEY'),
    forcePathStyle: required('S3_FORCE_PATH_STYLE', 'true') === 'true',
  },

  kafka: {
    brokers: required('KAFKA_BROKERS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    clientId: required('KAFKA_CLIENT_ID', 'job-tracker'),
  },

  mail: {
    host: required('MAIL_HOST', 'localhost'),
    port: Number(required('MAIL_PORT', '1025')),
    from: required('MAIL_FROM', 'no-reply@jobtracker.local'),
  },

  followupReminderDays: Number(required('FOLLOWUP_REMINDER_DAYS', '7')),
};
