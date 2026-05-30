import cron, { type ScheduledTask } from 'node-cron';
import { runFollowupScan } from './followupScan';

let task: ScheduledTask | undefined;

// 09:00 UTC every day.
const SCHEDULE = '0 9 * * *';

export function startCron(): void {
  if (task) return;
  task = cron.schedule(
    SCHEDULE,
    async () => {
      try {
        await runFollowupScan();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[cron] followup scan failed', err);
      }
    },
    { timezone: 'UTC' },
  );
  // eslint-disable-next-line no-console
  console.log(`[cron] followup scan scheduled (${SCHEDULE} UTC)`);
}

export function stopCron(): void {
  if (!task) return;
  task.stop();
  task = undefined;
}

export { runFollowupScan };
