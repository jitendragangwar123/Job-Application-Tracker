import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { paginated, paginationQuery } from './pagination';
import { createCompany, getCompanyById, listCompanies } from '../services/companies';
import { Errors } from '../services/errors';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().max(500).optional(),
  notes: z.string().max(10_000).optional(),
});

const listQuery = paginationQuery.extend({
  name: z.string().min(1).max(200).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const company = await createCompany(input);
    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { limit, offset, name } = listQuery.parse(req.query);
    const { items, total } = await listCompanies(name, limit, offset);
    res.json(paginated(items, total, { limit, offset }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const company = await getCompanyById(id);
    res.json(company);
  } catch (err) {
    if (err instanceof z.ZodError) return next(Errors.notFound('Company not found'));
    next(err);
  }
});

export default router;
