import {
  AttendanceConnectionMode,
  AttendanceProvider,
  AttendanceSyncIntervalUnit,
} from '@prisma/client';

import type { AttendanceConnectorDefinition } from './connector.types';

/**
 * ZKTeco legacy standalone terminals reached over TCP through the `zkemkeeper`
 * COM SDK, running inside an on-premise gateway.
 *
 * Every capability and limit below was established against a physical ZKTeco K50
 * (serial A2QO221160250, firmware 8.0.4.2-20200723) by the diagnostic worker in
 * `tools/zkteco-poc`, not from vendor documentation:
 *
 *   - Connect_Net, GetSerialNumber, ReadAllUserID + SSR_GetAllUserInfo,
 *     ReadGeneralLogData + SSR_GetGeneralLogData and Disconnect all succeeded.
 *   - 59 device users and raw attendance transactions were retrieved.
 *   - The installed component exposes 241 methods. `ReadTimeGLogData`
 *     (time-bounded) and `ReadNewGLogData` (new-only) are BOTH ABSENT, so this
 *     device family offers no incremental read: every poll returns the entire
 *     history, observed back to October 2022.
 *   - No stable per-transaction id is exposed, which is why ingestion depends on
 *     the event fingerprint.
 */
export const ZKTECO_LEGACY_CONNECTOR: AttendanceConnectorDefinition = {
  connectorType: 'zkteco-legacy-tcp',
  provider: AttendanceProvider.ZKTECO,
  connectionMode: AttendanceConnectionMode.LOCAL_GATEWAY,
  label: 'ZKTeco Legacy Terminal',
  description:
    'Fingerprint and card terminals from the ZKTeco standalone range, connected over your local network through a DijiPeople gateway.',

  capabilities: [
    'READ_DEVICE_INFO',
    'READ_USERS',
    'READ_ATTENDANCE',
    'POLL_EVENTS',
    'DEVICE_TIME',
    'PUNCH_STATE',
    'WORK_CODE',
    'LOCAL_GATEWAY_REQUIRED',
    // Identity write-back. Declared, but unproven — see below.
    'WRITE_USERS',
  ],

  experimentalCapabilities: [
    {
      capability: 'WRITE_USERS',
      reason:
        'The SDK exposes a user write path, but it has not been executed against a physical terminal. Phase 2 validates it. Until then automatic provisioning must not use this connector unattended.',
    },
  ],

  configurationSchema: {
    fields: [
      {
        key: 'host',
        label: 'Device IP address',
        type: 'string',
        required: true,
        placeholder: '192.168.1.50',
        helpText: 'The address the gateway uses to reach this terminal.',
      },
      {
        key: 'port',
        label: 'Port',
        type: 'number',
        required: true,
        defaultValue: 4370,
        min: 1,
        max: 65535,
        helpText: 'ZKTeco terminals use 4370 unless it has been changed.',
      },
      {
        key: 'machineNumber',
        label: 'Device ID',
        type: 'number',
        required: true,
        defaultValue: 1,
        min: 0,
        max: 255,
        helpText: 'Shown on the terminal under Menu > Comm > Device ID.',
      },
      {
        key: 'commKey',
        label: 'Communication key',
        type: 'secret',
        required: false,
        secret: true,
        defaultValue: 0,
        helpText:
          'Set on the terminal under Menu > Comm > Security. Leave blank if no key is configured. Stored encrypted and never shown again.',
      },
      {
        key: 'expectedSerialNumber',
        label: 'Expected serial number',
        type: 'string',
        required: false,
        helpText:
          'Optional safety check. If set, a sync warns when the terminal that answers reports a different serial.',
      },
      {
        key: 'timezone',
        label: 'Device timezone',
        type: 'timezone',
        required: false,
        helpText:
          'The terminal reports wall-clock times with no timezone. Set this so punches can be resolved to a point in time.',
      },
      /**
       * How much of the terminal's stored history to bring into DijiPeople.
       *
       * This terminal family has no time-bounded read, so the gateway always
       * enumerates the whole log. What this setting controls is which of those
       * records are ADMITTED — the rest are fingerprinted locally and dropped,
       * which is what stops a first sync from importing four years of punches
       * into live attendance. Nothing is ever deleted from the device.
       */
      {
        key: 'initialSyncMode',
        label: 'Import history from',
        type: 'select',
        required: false,
        defaultValue: 'CURRENT_DATE',
        options: [
          { value: 'CURRENT_DATE', label: 'Today onwards' },
          { value: 'LAST_N_DAYS', label: 'A number of recent days' },
          { value: 'FROM_DATE', label: 'A specific date onwards' },
          { value: 'ALL_HISTORY', label: 'Everything stored on the terminal' },
        ],
        helpText:
          'Terminals keep years of punches. "Today onwards" is the safe choice for going live; the older records stay on the device untouched.',
      },
      {
        key: 'initialSyncDays',
        label: 'Days of history to import',
        type: 'number',
        required: false,
        defaultValue: 7,
        min: 1,
        max: 3650,
        helpText: 'Used when importing a number of recent days.',
      },
      {
        key: 'initialSyncFromDate',
        label: 'Import punches from (date)',
        type: 'string',
        required: false,
        placeholder: '2026-01-01',
        pattern: '\\d{4}-\\d{2}-\\d{2}',
        patternMessage: 'Enter a date as YYYY-MM-DD, for example 2026-01-01.',
        helpText:
          'Used when importing from a specific date. Interpreted in the terminal’s own local time, because that is the only clock its punches carry.',
      },
    ],
  },

  /**
   * A poll re-reads the device's whole history, so a short interval multiplies
   * load without yielding more information. The 15-minute floor is enforced,
   * not advisory.
   */
  recommendedSyncPolicy: {
    mode: 'POLL',
    recommendedIntervalValue: 30,
    recommendedIntervalUnit: AttendanceSyncIntervalUnit.MINUTES,
    minimumIntervalMinutes: 15,
    rationale:
      'This terminal family has no incremental read, so every sync downloads the full attendance history. Frequent polling adds load without adding data.',
  },

  supportsMultipleDevices: true,
  requiresGateway: true,

  notes: [
    'Requires a DijiPeople gateway on a Windows machine that can reach the terminal.',
    'Each sync reads the terminal’s full history; DijiPeople stores only punches it has not seen before.',
    'Choose how far back to import before going live. The terminal keeps its own records either way — DijiPeople never deletes or edits them.',
    'Biometric templates are never read, transferred or stored. Only employee identifiers and punch records are exchanged.',
    'Device user passwords returned by the terminal are discarded and never stored.',
  ],
};
