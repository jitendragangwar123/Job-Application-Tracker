import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { dashboardCacheKey, getJson, setJson } from '../services/cache';
import { computeDashboard, type Dashboard } from '../services/dashboard';

const router = Router();
router.use(requireAuth);

const CACHE_TTL_SECONDS = 60;

router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const key = dashboardCacheKey(userId);

    const cached = await getJson<Dashboard>(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json(cached);
      return;
    }

    const fresh = await computeDashboard(userId);
    await setJson(key, fresh, CACHE_TTL_SECONDS);
    res.setHeader('X-Cache', 'MISS');
    res.json(fresh);
  } catch (err) {
    next(err);
  }
});

export default router;
