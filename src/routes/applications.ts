import { Router } from 'express';
import { z } from 'zod';
import { ApplicationStatus } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { paginated, paginationQuery } from './pagination';
import {
  createApplication,
  deleteApplication,
  getApplicationById,
  listApplications,
  updateApplication,
} from '../services/applications';
import { Errors } from '../services/errors';

const router = Router();
router.use(requireAuth);

const statusEnum = z.nativeEnum(ApplicationStatus);

const createSchema = z.object({
  companyId: z.string().uuid(),
  role: z.string().min(1).max(200),
  status: statusEnum.optional(),
  appliedAt: z.coerce.date().optional(),
  notes: z.string().max(10_000).optional(),
});

const updateSchema = z
  .object({
    role: z.string().min(1).max(200),
    status: statusEnum,
    appliedAt: z.coerce.date(),
    lastFollowedUpAt: z.coerce.date().nullable(),
    notes: z.string().max(10_000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const listQuery = paginationQuery.extend({
  status: statusEnum.optional(),
  companyId: z.string().uuid().optional(),
  appliedFrom: z.coerce.date().optional(),
  appliedTo: z.coerce.date().optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const app = await createApplication(req.user!.id, input);
    res.status(201).json(app);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { limit, offset, ...filters } = listQuery.parse(req.query);
    const { items, total } = await listApplications(req.user!.id, filters, limit, offset);
    res.json(paginated(items, total, { limit, offset }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const app = await getApplicationById(req.user!.id, id);
    res.json(app);
  } catch (err) {
    if (err instanceof z.ZodError) return next(Errors.notFound('Application not found'));
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = updateSchema.parse(req.body);
    const app = await updateApplication(req.user!.id, id, input);
    res.json(app);
  } catch (err) {
    if (err instanceof z.ZodError && err.issues.some((i) => i.path[0] === undefined)) {
      return next(Errors.notFound('Application not found'));
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    await deleteApplication(req.user!.id, id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) return next(Errors.notFound('Application not found'));
    next(err);
  }
});

export default router;
