import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { uploadResume as uploadMiddleware, MAX_RESUME_BYTES } from '../middleware/upload';
import { paginated, paginationQuery } from './pagination';
import {
  deleteResume,
  getResumeWithDownloadUrl,
  listResumes,
  uploadResume,
} from '../services/resumes';
import { Errors } from '../services/errors';

const router = Router();
router.use(requireAuth);

function handleMulterError(err: unknown, _req: Request, _res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(Errors.invalidInput(`File too large (max ${MAX_RESUME_BYTES} bytes)`));
    }
    return next(Errors.invalidInput(err.message));
  }
  next(err);
}

router.post(
  '/',
  (req, res, next) => uploadMiddleware(req, res, (err) => handleMulterError(err, req, res, next)),
  async (req, res, next) => {
    try {
      if (!req.file) throw Errors.invalidInput('Missing file (expected multipart field "file")');
      const resume = await uploadResume({
        userId: req.user!.id,
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        sizeBytes: req.file.size,
      });
      res.status(201).json({
        id: resume.id,
        filename: resume.filename,
        sizeBytes: resume.sizeBytes,
        uploadedAt: resume.uploadedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = paginationQuery.parse(req.query);
    const { items, total } = await listResumes(req.user!.id, limit, offset);
    res.json(paginated(items, total, { limit, offset }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const resume = await getResumeWithDownloadUrl(req.user!.id, id);
    res.json(resume);
  } catch (err) {
    if (err instanceof z.ZodError) return next(Errors.notFound('Resume not found'));
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    await deleteResume(req.user!.id, id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) return next(Errors.notFound('Resume not found'));
    next(err);
  }
});

export default router;
