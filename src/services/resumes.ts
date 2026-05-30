import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma';
import { deleteObject, getSignedDownloadUrl, putObject } from '../db/s3';
import { Errors } from './errors';
import { EXT_FOR_MIME, MAX_USER_STORAGE_BYTES } from '../middleware/upload';

export interface UploadResumeInput {
  userId: string;
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  sizeBytes: number;
}

function buildS3Key(userId: string, resumeId: string, mimetype: string): string {
  const ext = EXT_FOR_MIME[mimetype] ?? 'bin';
  return `users/${userId}/resumes/${resumeId}.${ext}`;
}

export async function uploadResume(input: UploadResumeInput) {
  const used = await prisma.resume.aggregate({
    where: { userId: input.userId },
    _sum: { sizeBytes: true },
  });
  const usedBytes = used._sum.sizeBytes ?? 0;
  if (usedBytes + input.sizeBytes > MAX_USER_STORAGE_BYTES) {
    throw Errors.invalidInput(
      `Storage quota exceeded (used ${usedBytes}B + ${input.sizeBytes}B > ${MAX_USER_STORAGE_BYTES}B)`,
    );
  }

  const resumeId = randomUUID();
  const s3Key = buildS3Key(input.userId, resumeId, input.mimetype);

  // Upload to S3 first. If the DB insert fails afterward, attempt cleanup so we don't orphan.
  await putObject({ key: s3Key, body: input.buffer, contentType: input.mimetype });

  try {
    return await prisma.resume.create({
      data: {
        id: resumeId,
        userId: input.userId,
        s3Key,
        filename: input.originalname,
        sizeBytes: input.sizeBytes,
      },
    });
  } catch (err) {
    await deleteObject(s3Key).catch(() => {
      /* best-effort cleanup */
    });
    throw err;
  }
}

export async function listResumes(userId: string, limit: number, offset: number) {
  const [items, total] = await Promise.all([
    prisma.resume.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
      take: limit,
      skip: offset,
      select: { id: true, filename: true, sizeBytes: true, uploadedAt: true },
    }),
    prisma.resume.count({ where: { userId } }),
  ]);
  return { items, total };
}

export async function getResumeWithDownloadUrl(userId: string, id: string) {
  const resume = await prisma.resume.findFirst({
    where: { id, userId },
  });
  if (!resume) throw Errors.notFound('Resume not found');
  const downloadUrl = await getSignedDownloadUrl(resume.s3Key, resume.filename);
  return {
    id: resume.id,
    filename: resume.filename,
    sizeBytes: resume.sizeBytes,
    uploadedAt: resume.uploadedAt,
    downloadUrl,
    downloadUrlExpiresIn: 15 * 60,
  };
}

export async function deleteResume(userId: string, id: string): Promise<void> {
  const resume = await prisma.resume.findFirst({
    where: { id, userId },
    select: { id: true, s3Key: true },
  });
  if (!resume) throw Errors.notFound('Resume not found');

  await prisma.resume.delete({ where: { id: resume.id } });
  await deleteObject(resume.s3Key).catch(() => {
    /* if S3 delete fails, DB row is already gone — log for janitor later */
  });
}
