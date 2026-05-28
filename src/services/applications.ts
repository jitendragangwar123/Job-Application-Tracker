import { ApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { Errors } from './errors';

export interface CreateApplicationInput {
  companyId: string;
  role: string;
  status?: ApplicationStatus;
  appliedAt?: Date;
  notes?: string;
}

export interface UpdateApplicationInput {
  role?: string;
  status?: ApplicationStatus;
  appliedAt?: Date;
  lastFollowedUpAt?: Date | null;
  notes?: string | null;
}

export interface ListApplicationsFilters {
  status?: ApplicationStatus;
  companyId?: string;
  appliedFrom?: Date;
  appliedTo?: Date;
}

export async function createApplication(userId: string, input: CreateApplicationInput) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true },
  });
  if (!company) throw Errors.invalidInput(`Company ${input.companyId} does not exist`);

  return prisma.application.create({
    data: {
      userId,
      companyId: input.companyId,
      role: input.role,
      status: input.status ?? ApplicationStatus.APPLIED,
      appliedAt: input.appliedAt,
      notes: input.notes,
    },
  });
}

export async function listApplications(
  userId: string,
  filters: ListApplicationsFilters,
  limit: number,
  offset: number,
) {
  const where: Prisma.ApplicationWhereInput = { userId };
  if (filters.status) where.status = filters.status;
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.appliedFrom || filters.appliedTo) {
    where.appliedAt = {};
    if (filters.appliedFrom) where.appliedAt.gte = filters.appliedFrom;
    if (filters.appliedTo) where.appliedAt.lte = filters.appliedTo;
  }

  const [items, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { appliedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.application.count({ where }),
  ]);

  return { items, total };
}

export async function getApplicationById(userId: string, id: string) {
  const app = await prisma.application.findFirst({ where: { id, userId } });
  if (!app) throw Errors.notFound('Application not found');
  return app;
}

export async function updateApplication(
  userId: string,
  id: string,
  input: UpdateApplicationInput,
) {
  // Ensure ownership before update (findFirst by id+userId).
  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) throw Errors.notFound('Application not found');

  return prisma.application.update({
    where: { id },
    data: {
      ...(input.role !== undefined && { role: input.role }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.appliedAt !== undefined && { appliedAt: input.appliedAt }),
      ...(input.lastFollowedUpAt !== undefined && { lastFollowedUpAt: input.lastFollowedUpAt }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
}

export async function deleteApplication(userId: string, id: string): Promise<void> {
  const result = await prisma.application.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw Errors.notFound('Application not found');
}
