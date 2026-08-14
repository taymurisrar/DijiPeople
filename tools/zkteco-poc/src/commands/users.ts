/**
 * `users` — device users via ReadAllUserID + SSR_GetAllUserInfo -> users.json.
 *
 * The password `SSR_GetAllUserInfo` returns is discarded inside the x86 worker
 * and never crosses into this process. No template or biometric API is called.
 */

import { normalizeUsers } from '../normalize/users';
import { createOutputWriter, envelope } from '../output';
import { heading, keyValue } from '../report';
import { formatCount } from '../util/time';
import {
  checkExpectedSerial,
  runSession,
  toDeviceInfo,
  type CommandContext,
} from './shared';

const PREVIEW_ROWS = 15;

export async function runUsers(context: CommandContext): Promise<number> {
  const { config, logger } = context;
  heading(logger, 'ZKTeco Device Users');

  const result = await runSession(context, { skipAttendance: true, skipCapabilities: true });
  const info = toDeviceInfo(result, config);
  const { users, skipped } = normalizeUsers(result.users ?? []);

  logger.print(`Users retrieved: ${formatCount(users.length)}`);
  if (skipped > 0) {
    logger.print(`Records skipped (no usable identifier): ${formatCount(skipped)}`);
  }

  if (users.length > 0) {
    logger.print();
    logger.print(`First ${Math.min(PREVIEW_ROWS, users.length)} of ${formatCount(users.length)}:`);
    keyValue(
      logger,
      users.slice(0, PREVIEW_ROWS).map((user) => [
        user.externalUserId,
        `${user.name ?? '(no name)'}   privilegeRaw=${user.privilegeRaw ?? '-'} enabled=${
          user.enabled ?? '-'
        }`,
      ]),
      '  ',
    );
  }

  const serial = checkExpectedSerial(info, config);
  if (!serial.matches) {
    logger.print();
    logger.print(`WARNING: ${serial.message}`);
  }

  const writer = createOutputWriter({
    directory: config.outputDir,
    enabled: config.writeOutput,
    logger,
  });

  writer.write(
    'users.json',
    envelope(
      { deviceSerialNumber: info.serialNumber, host: config.host, port: config.port, machineNumber: config.machineNumber },
      {
        userCount: users.length,
        skippedRecordCount: skipped,
        passwordsRetained: false,
        users,
      },
    ),
  );

  logger.print();
  return 0;
}
