import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { runFollowupScan } from '../jobs';

const router = Router();
router.use(requireAuth);

// Dev convenience: lets you trigger the daily scan immediately instead of
// waiting until 09:00 UTC. Runs system-wide (not scoped to the caller).
router.post('/followup-scan', async (_req, res, next) => {
  try {
    const result = await runFollowupScan();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
