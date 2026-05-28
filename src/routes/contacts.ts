import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { paginated, paginationQuery } from './pagination';
import { createContact, listContacts } from '../services/contacts';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().email().max(254).optional(),
  role: z.string().max(200).optional(),
});

const listQuery = paginationQuery.extend({
  companyId: z.string().uuid().optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const contact = await createContact(input);
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { limit, offset, companyId } = listQuery.parse(req.query);
    const { items, total } = await listContacts(companyId, limit, offset);
    res.json(paginated(items, total, { limit, offset }));
  } catch (err) {
    next(err);
  }
});

export default router;
