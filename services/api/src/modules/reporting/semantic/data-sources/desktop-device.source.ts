import { PERMISSION_KEYS } from '../../../../common/constants/permissions';
import { ENTITY_KEYS } from '../../../../common/constants/rbac-matrix';
import type {
  ReportDataSource,
  ReportFieldDefinition,
} from '../semantic.types';
import { employeeDimensionFields } from './workforce.source';

/**
 * Desktop devices — fleet health, not behaviour.
 *
 * This source answers "is the agent installed, current and reporting", which is
 * an operational question about software rather than an observation about a
 * person. It is kept apart from `desktop_activity` for that reason, and its
 * identifying fields are gated on the device-health permission, which a tenant
 * can grant to whoever runs the fleet without also granting them everyone's
 * activity.
 *
 * **The default period field is `createdAt`, not `lastSeenAt`.** A device that
 * has never connected has a null `lastSeenAt`, and counting those is one of the
 * things this source exists to do; a period narrowing on `lastSeenAt` would
 * silently drop exactly the rows the question is about.
 *
 * **The permission columns are three strings, not booleans.** `EmployeeDevice`
 * stores `cameraPermission`, `microphonePermission` and `locationPermission` as
 * free strings defaulting to `"UNKNOWN"`, with no enum behind them, so no
 * `enumValues` list is published for them: publishing one would let a filter be
 * validated against a vocabulary the database does not enforce.
 */

const permissionStateField = (args: {
  name: string;
  label: string;
  description: string;
  column: string;
}): ReportFieldDefinition => ({
  key: `desktop_devices.${args.name}`,
  label: args.label,
  description: args.description,
  type: 'string',
  path: args.column,
  reportable: true,
  filterable: true,
  groupable: true,
  groupByField: args.column,
  sensitivity: 'INTERNAL',
  permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_DEVICE_HEALTH_READ,
});

export const DESKTOP_DEVICES_SOURCE: ReportDataSource = {
  key: 'desktop_devices',
  label: 'Desktop devices',
  description:
    'Registered desktop agent installations, one row per device, with version and last-seen state.',
  prismaModel: 'employeeDevice',
  rbacEntityKey: ENTITY_KEYS.DESKTOP_ANALYTICS,
  scope: {
    organizationIdField: null,
    userIdField: 'userId',
  },
  // This model carries tenantId and employeeId and nothing else the access
  // helpers can narrow on. Scoping it on its own columns has only two
  // possible outcomes and both are wrong: the whole tenant, or nothing at
  // all. Scoping through the employee relation gives a business-unit reader
  // exactly the rows of the employees they can already see.
  scopeRelationPath: ['employee'],
  scopeRelationOptions: {
    organizationIdField: null,
    userIdField: 'userId',
  },
  defaultDateField: 'createdAt',
  // Describes a current population, not events in a window. Narrowing it by
  // the selected period would turn a headcount into a count of recent hires.
  periodScoped: false,
  recordIdField: 'id',
  caveats: [
    'A period narrows this source on when the device was REGISTERED, not on when it was last seen. That is deliberate: a device that has never connected has no last-seen timestamp and would disappear from any period filtered on it.',
    'A device row is never removed when a machine is retired — it is deactivated, or simply stops reporting. A fleet count includes machines nobody uses any more unless the active flag is filtered on.',
    'One employee may hold several devices, so device counts are not employee counts.',
    'Agent version is whatever the device last reported. Whether it is current has to be judged against the tenant AgentTrackingSettings, which is not part of this source.',
    'The camera, microphone and location permission columns are free strings defaulting to "UNKNOWN". "UNKNOWN" means the agent has not told us, which is not the same as "denied".',
  ],
  fields: [
    {
      key: 'desktop_devices.id',
      label: 'Device id',
      type: 'string',
      path: 'id',
      reportable: true,
      filterable: true,
      hidden: true,
    },
    {
      key: 'desktop_devices.device_name',
      label: 'Device name',
      description: 'Machine name as the agent reported it.',
      type: 'string',
      path: 'deviceName',
      reportable: true,
      filterable: true,
      sortable: true,
      sensitivity: 'INTERNAL',
      permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_DEVICE_HEALTH_READ,
    },
    {
      key: 'desktop_devices.device_fingerprint',
      label: 'Device fingerprint',
      description:
        'Stable hardware identifier the agent authenticates with. A tracking identifier for one machine, so it is restricted to fleet operators.',
      type: 'string',
      path: 'deviceFingerprint',
      reportable: true,
      filterable: true,
      sensitivity: 'RESTRICTED',
      permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_DEVICE_HEALTH_READ,
    },
    {
      key: 'desktop_devices.os',
      label: 'Operating system',
      type: 'string',
      path: 'os',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'os',
    },
    {
      key: 'desktop_devices.platform',
      label: 'Platform',
      type: 'string',
      path: 'platform',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'platform',
    },
    {
      key: 'desktop_devices.agent_version',
      label: 'Agent version',
      description:
        'Version the device last reported. Compare against the tenant minimum supported and latest versions to decide whether it is outdated.',
      type: 'string',
      path: 'agentVersion',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'agentVersion',
    },
    {
      key: 'desktop_devices.last_seen_at',
      label: 'Last seen at',
      description:
        'Last heartbeat from this device. Null means the device registered and has never connected.',
      type: 'datetime',
      path: 'lastSeenAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    {
      key: 'desktop_devices.is_active',
      label: 'Active',
      description:
        'Whether the device registration is still enabled. Independent of whether it has reported recently.',
      type: 'boolean',
      path: 'isActive',
      reportable: true,
      filterable: true,
      groupable: true,
      groupByField: 'isActive',
    },
    {
      key: 'desktop_devices.registered_at',
      label: 'Registered at',
      description:
        'When the device was first enrolled. The default period field for this source.',
      type: 'datetime',
      path: 'createdAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    permissionStateField({
      name: 'camera_permission',
      label: 'Camera permission',
      description:
        'What the agent last reported about camera access. Free string; "UNKNOWN" means unreported, not denied.',
      column: 'cameraPermission',
    }),
    permissionStateField({
      name: 'microphone_permission',
      label: 'Microphone permission',
      description:
        'What the agent last reported about microphone access. Free string; "UNKNOWN" means unreported, not denied.',
      column: 'microphonePermission',
    }),
    permissionStateField({
      name: 'location_permission',
      label: 'Location permission',
      description:
        'What the agent last reported about location access. Free string; "UNKNOWN" means unreported, not denied.',
      column: 'locationPermission',
    }),
    {
      key: 'desktop_devices.permission_updated_at',
      label: 'Permissions updated at',
      type: 'datetime',
      path: 'permissionUpdatedAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
      permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_DEVICE_HEALTH_READ,
    },
    ...employeeDimensionFields({
      sourceKey: 'desktop_devices',
      employeeRelationPath: ['employee'],
      employeeIdField: 'employeeId',
    }),
  ],
};
