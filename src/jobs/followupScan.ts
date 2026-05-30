import { ApplicationStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import { publishEvent } from '../events';
import { Topics } from '../events/types';
import { env } from '../config/env';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ScanResult {
  scanned: number;
  applicationIds: string[];
}

/**
 * Find applications still in APPLIED status that haven't been followed up in
 * `followupReminderDays`, emit followup.due for each, and bump lastFollowedUpAt
 * so we don't re-emit until the next window.
 */
export async function runFollowupScan(): Promise<ScanResult> {
  const reminderDays = env.followupReminderDays;
  const now = new Date();
  const cutoff = new Date(now.getTime() - reminderDays * MS_PER_DAY);

  const stale = await prisma.application.findMany({
    where: {
      status: ApplicationStatus.APPLIED,
      OR: [
        { lastFollowedUpAt: null, appliedAt: { lt: cutoff } },
        { lastFollowedUpAt: { lt: cutoff } },
      ],
    },
    include: {
      company: { select: { id: true, name: true } },
      user: { select: { email: true } },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[jobs] followup scan found ${stale.length} stale applications`);

  const ids: string[] = [];
  for (const app of stale) {
    const daysSinceApplied = Math.floor((now.getTime() - app.appliedAt.getTime()) / MS_PER_DAY);
    try {
      await publishEvent({
        type: Topics.FollowupDue,
        actor: { userId: app.userId },
        data: {
          application: { ...app, company: undefined, user: undefined } as never,
          company: app.company,
          userEmail: app.user.email,
          daysSinceApplied,
        },
      });
      await prisma.application.update({
        where: { id: app.id },
        data: { lastFollowedUpAt: now },
      });
      ids.push(app.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[jobs] failed to emit followup.due for', app.id, err);
    }
  }

  return { scanned: ids.length, applicationIds: ids };
}
