#!/usr/bin/env node
/**
 * Mock x86 worker — a TEST DOUBLE, not part of the POC's device path.
 *
 * It emits the same JSON contract as DijiPeople.ZkTeco.Worker.exe so the
 * normalise -> fingerprint -> JSON -> summary pipeline can be exercised on a
 * machine that has no zkemkeeper registration and no device on the network.
 * Point the CLI at it with:
 *
 *   npm run cli -- poc --host 192.168.18.53 --worker-path src/fixtures/mock-worker.js
 *
 * Everything it serves is synthetic. There is no biometric data and no password
 * field here, for the same reason the real worker has none.
 *
 * Plain JavaScript on purpose: it must be runnable directly by `node`, exactly
 * the way the CLI spawns the real worker executable.
 */

'use strict';

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}

function value(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
}

const host = value('--host', '192.168.18.53');
const port = Number.parseInt(value('--port', '4370'), 10);
const machineNumber = Number.parseInt(value('--machine-number', '1'), 10);

/** Names mirror the shape of the real device's directory; all invented. */
const USERS = [
  { externalUserId: '1', name: 'Taimur.Israr', privilegeRaw: 14, enabled: true },
  { externalUserId: '5', name: 'Madiha', privilegeRaw: 0, enabled: true },
  { externalUserId: '12', name: 'Fakhar', privilegeRaw: 0, enabled: true },
  { externalUserId: '17', name: 'Danish', privilegeRaw: 0, enabled: true },
  { externalUserId: '104', name: 'Sana', privilegeRaw: 0, enabled: false },
];

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Deterministic punches spanning a multi-year range, mirroring the historical
 * depth observed on the reference K50 (records back to 2022).
 */
function buildAttendance() {
  const punches = [];
  for (const year of [2022, 2026]) {
    for (let day = 24; day <= 26; day += 1) {
      for (const user of USERS) {
        const uid = Number.parseInt(user.externalUserId, 10);
        punches.push({
          externalUserId: user.externalUserId,
          occurredAtLocal: `${year}-10-${pad(day)}T${pad(9 + (uid % 3))}:${pad(uid % 60)}:04`,
          verificationModeRaw: 1,
          punchStateRaw: 0,
          workCodeRaw: 0,
        });
        punches.push({
          externalUserId: user.externalUserId,
          occurredAtLocal: `${year}-10-${pad(day)}T${pad(18 + (uid % 2))}:${pad(uid % 60)}:31`,
          verificationModeRaw: 1,
          punchStateRaw: uid % 5 === 0 ? 5 : 1,
          workCodeRaw: 0,
        });
      }
    }
  }
  // A deliberate exact duplicate, so fingerprint-collision reporting is exercised.
  punches.push({ ...punches[0] });
  return punches;
}

const now = new Date();
const deviceTimeLocal =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

const result = {
  contractVersion: 1,
  runtime: {
    is64BitProcess: false,
    processArchitecture: 'X86',
    framework: 'mock-worker (node)',
    osVersion: `${process.platform} ${process.arch}`,
    is64BitOperatingSystem: true,
  },
  com: {
    progId: 'zkemkeeper.ZKEM.1',
    clsid: '{00853A19-BD51-419B-9269-2DABE57EB61F}',
    instantiated: true,
  },
  connection: {
    host,
    port,
    machineNumber,
    connected: true,
    connectDurationMs: 42,
    disconnected: true,
    commKeyApplied: false,
  },
  device: {
    manufacturer: 'ZKTeco',
    model: 'K50',
    serialNumber: value('--mock-serial', 'A2QO221160250'),
    firmwareVersion: 'Ver 8.0.4.2 Jul 23 2020',
    platform: 'ZLM60_TFT',
    macAddress: '00:17:61:10:7D:6E',
    machineNumber,
    host,
    port,
    deviceTimeLocal,
    deviceStatusRaw: { 1: 1, 2: USERS.length, 6: 0 },
    unavailableFields: [],
  },
  diagnostics: ['mock worker: synthetic data, no device contacted'],
};

/**
 * Signature shapes are INVENTED placeholders that exercise the report layout —
 * parameter directions, optional flags, DISPIDs. They are NOT a claim about the
 * real component. Only `npm run capabilities` on the customer machine produces
 * authoritative signatures.
 */
function mockSignature(name, dispId, params) {
  return {
    name,
    dispId,
    invokeKind: 'INVOKE_FUNC',
    returnType: 'VARIANT_BOOL',
    parameterCount: params.length,
    optionalParameterCount: params.filter((p) => p.isOptional).length,
    funcFlags: 0,
    helpString: null,
    parameters: params.map((p, position) => ({
      position,
      name: p.name,
      type: p.type,
      direction: p.direction,
      isOptional: Boolean(p.isOptional),
      hasDefault: false,
      isReturnValue: false,
      rawFlags: p.direction === 'out' ? 2 : 1,
    })),
    declaration: `VARIANT_BOOL ${name}(${params
      .map((p) => `[${p.direction}] ${p.type} ${p.name}`)
      .join(', ')})`,
  };
}

if (!flag('--skip-capabilities')) {
  const signatures = [
    mockSignature('ReadLastestLogData', 1234, [
      { name: 'dwMachineNumber', type: 'LONG', direction: 'in' },
    ]),
    mockSignature('ReadAllGLogData', 1235, [
      { name: 'dwMachineNumber', type: 'LONG', direction: 'in' },
    ]),
    mockSignature('GetAllGLogData', 1236, [
      { name: 'dwMachineNumber', type: 'LONG', direction: 'in' },
      { name: 'dwTMachineNumber', type: 'LONG*', direction: 'out' },
      { name: 'dwEnrollNumber', type: 'LONG*', direction: 'out' },
      { name: 'dwEMachineNumber', type: 'LONG*', direction: 'out' },
      { name: 'dwVerifyMode', type: 'LONG*', direction: 'out' },
      { name: 'dwInOutMode', type: 'LONG*', direction: 'out' },
      { name: 'dwYear', type: 'LONG*', direction: 'out' },
      { name: 'dwMonth', type: 'LONG*', direction: 'out' },
      { name: 'dwDay', type: 'LONG*', direction: 'out' },
      { name: 'dwHour', type: 'LONG*', direction: 'out' },
      { name: 'dwMinute', type: 'LONG*', direction: 'out' },
    ]),
    mockSignature('GetGeneralExtLogData', 1237, [
      { name: 'dwMachineNumber', type: 'LONG', direction: 'in' },
      { name: 'dwEnrollNumber', type: 'LONG*', direction: 'out' },
      { name: 'dwEMachineNumber', type: 'LONG*', direction: 'out' },
      { name: 'dwVerifyMode', type: 'LONG*', direction: 'out' },
      { name: 'dwInOutMode', type: 'LONG*', direction: 'out' },
      { name: 'dwYear', type: 'LONG*', direction: 'out' },
      { name: 'dwMonth', type: 'LONG*', direction: 'out' },
      { name: 'dwDay', type: 'LONG*', direction: 'out' },
      { name: 'dwHour', type: 'LONG*', direction: 'out' },
      { name: 'dwMinute', type: 'LONG*', direction: 'out' },
      { name: 'dwSecond', type: 'LONG*', direction: 'out' },
      { name: 'dwWorkCode', type: 'LONG*', direction: 'out' },
    ]),
    mockSignature('SSR_GetGeneralLogData', 1238, [
      { name: 'dwMachineNumber', type: 'LONG', direction: 'in' },
      { name: 'dwEnrollNumber', type: 'BSTR*', direction: 'out' },
      { name: 'dwVerifyMode', type: 'LONG*', direction: 'out' },
      { name: 'dwInOutMode', type: 'LONG*', direction: 'out' },
      { name: 'dwYear', type: 'LONG*', direction: 'out' },
      { name: 'dwMonth', type: 'LONG*', direction: 'out' },
      { name: 'dwDay', type: 'LONG*', direction: 'out' },
      { name: 'dwHour', type: 'LONG*', direction: 'out' },
      { name: 'dwMinute', type: 'LONG*', direction: 'out' },
      { name: 'dwSecond', type: 'LONG*', direction: 'out' },
      { name: 'dwWorkCode', type: 'LONG*', direction: 'out' },
    ]),
  ];

  result.capabilities = {
    typeInfoAvailable: true,
    methods: signatures.map((s) => s.name).concat(['Connect_Net', 'Disconnect', 'SetLastCount']),
    signatures,
    targetSignatures: signatures.filter((s) =>
      ['ReadLastestLogData', 'GetGeneralExtLogData', 'GetAllGLogData', 'ReadAllGLogData'].includes(
        s.name,
      ),
    ),
    logRelatedMethods: signatures.map((s) => s.name),
    markerRelatedMethods: ['SetLastCount'],
    incrementalCandidates: {
      ReadTimeGLogData: false,
      ReadNewGLogData: false,
      ReadLastestLogData: true,
      ReadAllGLogData: true,
      SSR_GetGeneralLogData: true,
      GetGeneralExtLogData: true,
      GetAllGLogData: true,
    },
  };
}

if (flag('--probe-latest-log')) {
  const limitIndex = args.indexOf('--probe-limit');
  const limit = limitIndex >= 0 ? Number.parseInt(args[limitIndex + 1], 10) : 20;
  result.latestLogProbe = {
    readMethod: 'ReadLastestLogData',
    getMethod: 'SSR_GetGeneralLogData',
    readSucceeded: true,
    recordLimit: limit,
    recordsReturned: Math.min(limit, 3),
    records: buildAttendance().slice(-Math.min(limit, 3)),
  };
}

if (!flag('--skip-users')) {
  result.users = USERS;
}

if (!flag('--skip-attendance')) {
  result.attendance = buildAttendance();
}

process.stderr.write('[mock-worker] emitting synthetic result\n');
process.stdout.write(JSON.stringify(result));
