import type { Consumer } from 'kafkajs';
import { kafka } from '../kafka';
import { Topics, type FollowupDueData } from '../types';
import { sendMail } from '../../services/mail';
import { logger } from '../../logger';

const SUBSCRIPTIONS = [
  Topics.ApplicationCreated,
  Topics.StatusChanged,
  Topics.InterviewScheduled,
  Topics.FollowupDue,
];

const log = logger.child({ consumer: 'email-service' });

function renderFollowupEmail(data: FollowupDueData): {
  to: string;
  subject: string;
  text: string;
  html: string;
} {
  const { application, company, userEmail, daysSinceApplied } = data;
  const subject = `Follow up: your application to ${company.name}`;
  const text =
    `Hi,\n\n` +
    `It's been ${daysSinceApplied} days since you applied to ${company.name} ` +
    `for the ${application.role} role.\n\n` +
    `Consider sending a polite follow-up — companies appreciate persistence.\n\n` +
    `Update the status directly in your tracker when you hear back.\n\n` +
    `— Job Application Tracker`;
  const html =
    `<p>Hi,</p>` +
    `<p>It's been <strong>${daysSinceApplied} days</strong> since you applied to ` +
    `<strong>${company.name}</strong> for the <em>${application.role}</em> role.</p>` +
    `<p>Consider sending a polite follow-up — companies appreciate persistence.</p>` +
    `<p>Update the status directly in your tracker when you hear back.</p>` +
    `<p>— Job Application Tracker</p>`;
  return { to: userEmail, subject, text, html };
}

export async function startEmailConsumer(): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId: 'email-service' });
  await consumer.connect();
  await consumer.subscribe({ topics: SUBSCRIPTIONS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;

      if (topic === Topics.FollowupDue) {
        try {
          const envelope = JSON.parse(raw) as { data: FollowupDueData };
          const mail = renderFollowupEmail(envelope.data);
          await sendMail(mail);
          log.info({ to: mail.to }, 'sent followup reminder');
        } catch (err) {
          log.error({ err }, 'failed to send followup email');
        }
        return;
      }

      // Other topics: stub-log for now.
      log.debug({ topic }, 'received event');
    },
  });

  return consumer;
}
