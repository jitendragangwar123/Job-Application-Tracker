import type { Application, ApplicationStatus } from '@prisma/client';

export const Topics = {
  ApplicationCreated: 'application.created',
  StatusChanged: 'status.changed',
  InterviewScheduled: 'interview.scheduled',
  FollowupDue: 'followup.due', // emitted by Step 7's cron
} as const;

export type Topic = (typeof Topics)[keyof typeof Topics];

export const ALL_TOPICS: readonly Topic[] = Object.values(Topics);

export interface EventEnvelope<T extends Topic = Topic, D = unknown> {
  id: string;
  type: T;
  occurredAt: string; // ISO-8601 UTC
  actor: { userId: string };
  data: D;
}

// Per-topic payload shapes
export type ApplicationCreatedData = { application: Application };
export type StatusChangedData = {
  application: Application;
  from: ApplicationStatus;
  to: ApplicationStatus;
};
export type InterviewScheduledData = { application: Application };
export type FollowupDueData = {
  applicationId: string;
  daysSinceApplied: number;
};

export type AnyEvent =
  | EventEnvelope<typeof Topics.ApplicationCreated, ApplicationCreatedData>
  | EventEnvelope<typeof Topics.StatusChanged, StatusChangedData>
  | EventEnvelope<typeof Topics.InterviewScheduled, InterviewScheduledData>
  | EventEnvelope<typeof Topics.FollowupDue, FollowupDueData>;
