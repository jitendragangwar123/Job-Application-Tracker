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
};
