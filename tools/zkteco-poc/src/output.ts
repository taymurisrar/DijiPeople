/**
 * JSON artefact writer.
 *
 * Everything lands in a gitignored folder (default `tools/zkteco-poc/output/`)
 * because these files contain real customer attendance data.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ZkPocError, describeThrown } from './errors';
import type { Logger } from './logger';

export interface OutputWriter {
  readonly enabled: boolean;
  readonly directory: string;
  write(fileName: string, payload: unknown): string | undefined;
}

export function createOutputWriter(options: {
  directory: string;
  enabled: boolean;
  logger: Logger;
}): OutputWriter {
  const { directory, enabled, logger } = options;

  if (enabled) {
    try {
      mkdirSync(directory, { recursive: true });
    } catch (thrown) {
      const { message } = describeThrown(thrown);
      throw new ZkPocError(
        'OUTPUT_WRITE_FAILED',
        `Could not create the output directory ${directory}: ${message}`,
        {
          remediation: [
            'point ZK_OUTPUT_DIR at a writable folder',
            'or pass --no-write to run without saving JSON',
          ],
          cause: thrown,
        },
      );
    }
  }

  return {
    enabled,
    directory,
    write(fileName, payload) {
      if (!enabled) {
        logger.debug('output.skipped', { file: fileName, reason: '--no-write' });
        return undefined;
      }

      const target = join(directory, fileName);
      try {
        writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        logger.info('output.written', { file: fileName });
        return target;
      } catch (thrown) {
        const { message } = describeThrown(thrown);
        throw new ZkPocError('OUTPUT_WRITE_FAILED', `Could not write ${target}: ${message}`, {
          remediation: [
            'check folder permissions on ZK_OUTPUT_DIR',
            'close any program holding the file open',
          ],
          cause: thrown,
        });
      }
    },
  };
}

export interface EnvelopeBase {
  deviceSerialNumber?: string;
  host: string;
  port: number;
  machineNumber?: number;
}

/**
 * Envelope shared by every artefact so files are self-describing — including the
 * two guarantees a reviewer will look for first.
 */
export function envelope<T extends Record<string, unknown>>(
  base: EnvelopeBase,
  body: T,
): Record<string, unknown> {
  return {
    generatedBy: 'dijipeople/tools/zkteco-poc',
    retrievedAt: new Date().toISOString(),
    integrationPath: 'zkemkeeper.ZKEM.1 (x86 COM) -> Connect_Net',
    biometricDataRetrieved: false,
    devicePasswordsRetained: false,
    // Consumers of these files must not re-interpret the timestamps.
    timestampPolicy:
      'All *Local timestamps are device-local wall clock (YYYY-MM-DDTHH:mm:ss). ' +
      'The device states no timezone: never append "Z", never treat them as UTC, ' +
      'and never assume the gateway machine timezone. The tenant timezone must be ' +
      'applied deliberately in a later phase.',
    firmwareVersionNote:
      'firmwareVersion comes from the SDK GetFirmwareVersion call and may report a ' +
      'different component/version than the string shown on the device UI. Both are ' +
      'recorded as reported; neither is corrected.',
    device: {
      serialNumber: base.deviceSerialNumber ?? null,
      host: base.host,
      port: base.port,
      machineNumber: base.machineNumber ?? null,
    },
    ...body,
  };
}
