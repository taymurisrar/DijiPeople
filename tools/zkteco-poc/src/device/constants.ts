/**
 * Facts about the proven COM integration path, kept in one place so the CLI and
 * the README cannot drift apart. These mirror the values pinned in the worker
 * (`ZkemAdapter.ProgId` / `ZkemAdapter.ExpectedClsid`).
 */

export const ZkemProgId = 'zkemkeeper.ZKEM.1';

export const ZkemClsid = '{00853A19-BD51-419B-9269-2DABE57EB61F}';

/** The SDK methods the worker's allowlist permits. Mirrored for reporting only. */
export const ALLOWED_SDK_METHODS = [
  'SetCommPassword',
  'Connect_Net',
  'Disconnect',
  'GetLastError',
  'GetSerialNumber',
  'GetProductCode',
  'GetFirmwareVersion',
  'GetPlatform',
  'GetDeviceMAC',
  'GetVendor',
  'GetDeviceTime',
  'GetDeviceStatus',
  'ReadAllUserID',
  'SSR_GetAllUserInfo',
  'ReadGeneralLogData',
  'SSR_GetGeneralLogData',
] as const;
