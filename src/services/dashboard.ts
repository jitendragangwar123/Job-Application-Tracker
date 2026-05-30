import { ApplicationStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import { env } from '../config/env';

const RECENT_LIMIT = 5;
const UPCOMING_LIMIT = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ALL_STATUSES = Object.values(ApplicationStatus) as ApplicationStatus[];

export interface DashboardApp {
  id: string;
  role: string;
  status: ApplicationStatus;
  appliedAt: Date;
  lastFollowedUpAt: Date | null;
  updatedAt: Date;
  company: { id: string; name: string };
}

export interface Dashboard {
  counts: {
    byStatus: Record<ApplicationStatus, number>;
    total: number;
  };
  recentApplications: DashboardApp[];
  upcomingFollowups: DashboardApp[];
  generatedAt: string;
}

export async function computeDashboard(userId: string): Promise<Dashboard> {
  const cutoff = new Date(Date.now() - env.followupReminderDays * MS_PER_DAY);

  const [groupedCounts, recent, upcoming] = await Promise.all([
    prisma.application.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: RECENT_LIMIT,
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.application.findMany({
      where: {
        userId,
        status: ApplicationStatus.APPLIED,
        OR: [
          { lastFollowedUpAt: null, appliedAt: { lt: cutoff } },
          { lastFollowedUpAt: { lt: cutoff } },
        ],
      },
      orderBy: { appliedAt: 'asc' },
      take: UPCOMING_LIMIT,
      include: { company: { select: { id: true, name: true } } },
    }),
  ]);

  const byStatus = ALL_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<ApplicationStatus, number>,
  );
  let total = 0;
  for (const row of groupedCounts) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }

  const shape = (a: (typeof recent)[number]): DashboardApp => ({
    id: a.id,
    role: a.role,
    status: a.status,
    appliedAt: a.appliedAt,
    lastFollowedUpAt: a.lastFollowedUpAt,
    updatedAt: a.updatedAt,
    company: a.company,
  });

  return {
    counts: { byStatus, total },
    recentApplications: recent.map(shape),
    upcomingFollowups: upcoming.map(shape),
    generatedAt: new Date().toISOString(),
  };
}
