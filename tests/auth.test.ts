import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { redis } from '../src/db/redis';

const TEST_EMAIL_PREFIX = 'test-auth-';

async function cleanup(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  // Drain any rate-limit keys this test produced.
  const keys = await redis.keys('ratelimit:login:test-auth-*');
  if (keys.length > 0) await redis.del(...keys);
}

const uniqueEmail = (label: string): string =>
  `${TEST_EMAIL_PREFIX}${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const app = createApp();

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
  await redis.quit();
});

describe('POST /auth/register', () => {
  it('creates a user and returns tokens', async () => {
    const email = uniqueEmail('register');
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email });
    expect(res.body.user.id).toEqual(expect.any(String));
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rejects weak passwords with 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('weak'), password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects duplicate emails with 409', async () => {
    const email = uniqueEmail('dup');
    const body = { email, password: 'correct-horse-battery' };
    await request(app).post('/auth/register').send(body).expect(201);
    const res = await request(app).post('/auth/register').send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('POST /auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    const email = uniqueEmail('login-ok');
    const password = 'correct-horse-battery';
    await request(app).post('/auth/register').send({ email, password }).expect(201);

    const res = await request(app).post('/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
  });

  it('returns 401 for bad password (and reveals nothing else)', async () => {
    const email = uniqueEmail('login-bad');
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);

    const res = await request(app).post('/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('returns 401 for unknown email (same message as bad password)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'whatever-12345' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('rate-limits after 5 attempts per email', async () => {
    const email = uniqueEmail('rl');
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);

    // 5 attempts allowed, the 6th should be rate-limited.
    for (let i = 0; i < 5; i++) {
      await request(app).post('/auth/login').send({ email, password: 'wrong-password' });
    }
    const res = await request(app).post('/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toEqual(expect.any(String));
  });
});

describe('GET /auth/me', () => {
  it('returns the user for a valid access token', async () => {
    const email = uniqueEmail('me');
    const password = 'correct-horse-battery';
    const reg = await request(app).post('/auth/register').send({ email, password });
    const token = reg.body.tokens.accessToken;

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a refresh token (wrong type)', async () => {
    const email = uniqueEmail('wrongtype');
    const reg = await request(app)
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery' });
    const refresh = reg.body.tokens.refreshToken;

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${refresh}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('issues new tokens given a valid refresh token', async () => {
    const email = uniqueEmail('refresh');
    const reg = await request(app)
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery' });
    const refreshToken = reg.body.tokens.refreshToken;

    const res = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rejects an access token used as a refresh token', async () => {
    const email = uniqueEmail('refresh-bad');
    const reg = await request(app)
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery' });
    const access = reg.body.tokens.accessToken;

    const res = await request(app).post('/auth/refresh').send({ refreshToken: access });
    expect(res.status).toBe(401);
  });
});
