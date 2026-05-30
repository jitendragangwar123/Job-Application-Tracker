import multer from 'multer';
import type { Request } from 'express';
import { Errors } from '../services/errors';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_USER_STORAGE_BYTES = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const EXT_FOR_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(Errors.invalidInput(`Unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
}

export const uploadResume = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_BYTES, files: 1 },
  fileFilter,
}).single('file');
