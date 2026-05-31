import cron, { type ScheduledTask } from 'node-cron';
import { runFollowupScan } from './followupScan';
import { logger } from '../logger';
import { cronLastRunTimestamp } from '../middleware/metrics';

let task: ScheduledTask | undefined;

// 09:00 UTC every day.
const SCHEDULE = '0 9 * * *';
const JOB_NAME = 'followup_scan';

export function startCron(): void {
  if (task) return;
  task = cron.schedule(
    SCHEDULE,
    async () => {
      try {
        await runFollowupScan();
        cronLastRunTimestamp.labels(JOB_NAME).set(Date.now() / 1000);
      } catch (err) {
        logger.error({ err }, 'followup scan failed');
      }
    },
    { timezone: 'UTC' },
  );
  logger.info({ schedule: SCHEDULE }, 'cron: followup scan scheduled');
}

export function stopCron(): void {
  if (!task) return;
  task.stop();
  task = undefined;
}

export { runFollowupScan };
export { JOB_NAME as FOLLOWUP_JOB_NAME };
