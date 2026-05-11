export type NotificationJobOptions = {
  attempts?: number;
  delayMs?: number;
  correlationId?: string | null;
  sourceModule?: string | null;
};
