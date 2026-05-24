import { Router } from 'express';
import { z } from 'zod';
import { loginUser, refreshTokens, registerUser } from '../services/auth';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// 5 failed-ish login attempts per email per 15 minutes.
// (Counts all attempts, not just failures — simpler and a reasonable signal.)
const loginRateLimit = rateLimit({
  name: 'login',
  windowSeconds: 15 * 60,
  max: 5,
  keyFn: (req) => {
    const raw = (req.body?.email as string | undefined)?.toLowerCase().trim();
    return raw && raw.length > 0 ? raw : undefined;
  },
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = credentialsSchema.parse(req.body);
    const result = await registerUser(email, password);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const { email, password } = credentialsSchema.parse(req.body);
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await refreshTokens(refreshToken);
    res.json({ tokens });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
