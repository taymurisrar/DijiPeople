/**
 * `capabilities` — what the installed zkemkeeper actually exposes, with exact
 * signatures pulled from the component's own type library.
 *
 * This is the evidence-gathering command. It answers "what is the real signature
 * of ReadLastestLogData / GetGeneralExtLogData / GetAllGLogData / ReadAllGLogData?"
 * from the customer's installed component rather than from documentation or
 * memory.
 *
 * It enumerates type metadata only — no device method is invoked, so it is safe
 * to run at any time. It still connects, so the report is tied to a real session.
 *
 * IMPORTANT LIMIT: type information proves a calling convention, never
 * behaviour. A method listed here is NOT thereby proven side-effect free; in
 * particular nothing here can show whether a call advances a device-side read
 * marker shared with the customer's V2011 software.
 */

import { ZkemClsid, ZkemProgId } from '../device/constants';
import { createOutputWriter, envelope } from '../output';
import { heading, keyValue, runtimeRows } from '../report';
import type { Logger } from '../logger';
import type { SdkMethodSignature } from '../types';
import { runSession, toDeviceInfo, type CommandContext } from './shared';

/** The methods under investigation for incremental retrieval. */
const SIGNATURE_TARGETS = [
  'ReadLastestLogData',
  'GetGeneralExtLogData',
  'GetAllGLogData',
  'ReadAllGLogData',
];

function printSignature(logger: Logger, signature: SdkMethodSignature): void {
  logger.print();
  logger.print(`  ${signature.name}`);
  logger.print(`  ${'-'.repeat(signature.name.length)}`);
  keyValue(
    logger,
    [
      ['DISPID', String(signature.dispId)],
      ['Invoke kind', signature.invokeKind],
      ['Return type', signature.returnType],
      ['Parameters', String(signature.parameterCount)],
      ['Optional parameters', String(signature.optionalParameterCount)],
      ...(signature.helpString
        ? ([['Help string', signature.helpString]] as Array<[string, string]>)
        : []),
      ['Declaration', signature.declaration],
    ],
    '    ',
  );

  if (signature.parameters.length > 0) {
    logger.print();
    logger.print('    Parameters:');
    keyValue(
      logger,
      signature.parameters.map((parameter) => [
        `#${parameter.position} ${parameter.name}`,
        `${parameter.type}  [${parameter.direction}]${parameter.isOptional ? ' optional' : ''}${
          parameter.hasDefault ? ' hasDefault' : ''
        }${parameter.isReturnValue ? ' retval' : ''}`,
      ]),
      '      ',
    );
  }
}

export async function runCapabilities(context: CommandContext): Promise<number> {
  const { config, logger } = context;
  heading(logger, 'ZKTeco SDK Capabilities');

  const focus = typeof config.methodFilter === 'string' ? config.methodFilter : undefined;

  const result = await runSession(context, { skipUsers: true, skipAttendance: true });
  const info = toDeviceInfo(result, config);
  const capabilities = result.capabilities;

  keyValue(logger, [...runtimeRows(result.runtime, ZkemProgId), ['CLSID', ZkemClsid]]);
  logger.print();

  if (!capabilities || !capabilities.typeInfoAvailable) {
    logger.print('SDK type information could not be enumerated.');
    if (capabilities?.probeError) logger.print(`Reason: ${capabilities.probeError}`);
    logger.print();
    logger.print('Incremental-retrieval support therefore remains UNKNOWN and must not be assumed.');
    return 1;
  }

  logger.print(`Methods exposed by ${ZkemProgId}: ${capabilities.methods.length}`);

  const signatures = capabilities.signatures ?? [];

  if (focus) {
    const needle = focus.toLowerCase();
    const matches = signatures.filter((signature) =>
      signature.name.toLowerCase().includes(needle),
    );
    logger.print();
    logger.print(`Signatures matching "${focus}": ${matches.length}`);
    for (const signature of matches) printSignature(logger, signature);
  } else {
    logger.print();
    logger.print('Signatures under investigation');
    logger.print('==============================');

    for (const target of SIGNATURE_TARGETS) {
      const signature = signatures.find((candidate) => candidate.name === target);
      if (signature) {
        printSignature(logger, signature);
      } else {
        logger.print();
        logger.print(`  ${target}`);
        logger.print(`  ${'-'.repeat(target.length)}`);
        logger.print('    NOT PRESENT on this component.');
      }
    }

    logger.print();
    logger.print('Log / attendance related methods:');
    for (const method of capabilities.logRelatedMethods) {
      logger.print(`  ${method}`);
    }

    if (capabilities.markerRelatedMethods && capabilities.markerRelatedMethods.length > 0) {
      logger.print();
      logger.print('Read-marker / counter / clear methods present on the component');
      logger.print('(listed so their existence is visible — NONE are ever called):');
      for (const method of capabilities.markerRelatedMethods) {
        logger.print(`  ${method}`);
      }
    }

    logger.print();
    logger.print('Incremental-retrieval candidates:');
    keyValue(
      logger,
      Object.entries(capabilities.incrementalCandidates).map(([name, present]) => [
        name,
        present ? 'PRESENT' : 'absent',
      ]),
      '  ',
    );
  }

  logger.print();
  logger.print('Interpretation limits');
  logger.print('---------------------');
  logger.print('  PRESENT means the component exposes the method. It does NOT mean this');
  logger.print('  K50 firmware honours it, and it does NOT mean the method is free of');
  logger.print('  device-side side effects. Type information describes a calling');
  logger.print('  convention, not behaviour: whether a call advances or clears a');
  logger.print('  device-side read marker CANNOT be determined from this output.');

  const writer = createOutputWriter({
    directory: config.outputDir,
    enabled: config.writeOutput,
    logger,
  });

  writer.write(
    'sdk-capabilities.json',
    envelope(
      {
        deviceSerialNumber: info.serialNumber,
        host: config.host,
        port: config.port,
        machineNumber: config.machineNumber,
      },
      {
        progId: ZkemProgId,
        clsid: ZkemClsid,
        runtime: result.runtime,
        methodCount: capabilities.methods.length,
        capabilities,
        notes: [
          'Signatures are read from the component type library; they are exact.',
          'Method presence does not prove firmware support.',
          'Type information cannot prove the absence of device-side side effects, including read-marker mutation.',
        ],
      },
    ),
  );

  logger.print();
  return 0;
}
