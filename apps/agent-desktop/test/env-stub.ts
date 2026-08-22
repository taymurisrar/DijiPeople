/**
 * `src/config/env.ts` reads `process.env` at import time and throws on a missing
 * required variable, which would make every spec depend on a populated `.env`.
 *
 * Only the values the modules under test actually read are declared, so a spec
 * that starts depending on a new one fails loudly here rather than picking up a
 * silent default. ITEM-0033.
 */
export const agentEnv = {
  appName: "DijiPeople Agent",
  apiBaseUrl: "http://localhost:4000/api",
  apiOrigin: "http://localhost:4000",
  appVersion: "0.0.0-test",
  offlineQueueMaxItems: 5000,
  heartbeatIntervalSeconds: 60,
  idleThresholdSeconds: 300,
  awayThresholdSeconds: 900,
  heartbeatBatchSize: 50,
  offlineQueueEnabled: true,
  activeAppTrackingEnabled: true,
  windowTitleTrackingEnabled: true,
  autoUpdateEnabled: true,
  trayStatusEnabled: true,
};
