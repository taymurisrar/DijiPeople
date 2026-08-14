#!/usr/bin/env node
/**
 * DijiPeople — ZKTeco K50 attendance device POC.
 *
 * Isolated proof of concept. It is NOT part of the DijiPeople npm workspaces,
 * NOT imported by the API, and writes nothing to the DijiPeople database.
 * Its only job is to prove that DijiPeople-owned code can talk to the physical
 * device directly, read-only, over the validated zkemkeeper COM path.
 *
 * This process stays architecture-neutral. The 32-bit COM component is reached
 * through a short-lived x86 worker child process.
 */

import { loadEnvFile, parseCli, resolveConfig, type CliInvocation } from './config';
import { runAttendance } from './commands/attendance';
import { runCapabilities } from './commands/capabilities';
import { runDeviceInfo } from './commands/device-info';
import { runPoc } from './commands/poc';
import { runProbeLatestLog } from './commands/probe-latest-log';
import { runTest } from './commands/test';
import { runUsers } from './commands/users';
import type { CommandContext } from './commands/shared';
import { describeThrown, isZkPocError } from './errors';
import { createLogger } from './logger';

type CommandHandler = (context: CommandContext) => Promise<number>;

const COMMANDS: Record<string, { run: CommandHandler; summary: string }> = {
  test: { run: runTest, summary: 'Connect, read the serial, disconnect. Writes nothing.' },
  'device-info': { run: runDeviceInfo, summary: 'Device metadata + clock drift -> device-info.json' },
  users: { run: runUsers, summary: 'Device users -> users.json' },
  attendance: { run: runAttendance, summary: 'Raw attendance punches -> attendance.json' },
  capabilities: {
    run: runCapabilities,
    summary: 'What the installed SDK exposes -> sdk-capabilities.json',
  },
  poc: { run: runPoc, summary: 'Full run: connect -> metadata -> users -> punches -> JSON -> disconnect' },
  'probe-latest-log': {
    run: runProbeLatestLog,
    summary: 'OPT-IN experiment: ReadLastestLogData. Blocked without --confirm-read-only.',
  },
};

const USAGE = `
DijiPeople ZKTeco K50 POC (read-only, via zkemkeeper.ZKEM.1 in an x86 worker)

Usage:
  npm run cli -- <command> [flags]

Commands:
${Object.entries(COMMANDS)
  .map(([name, meta]) => `  ${name.padEnd(14)}${meta.summary}`)
  .join('\n')}
  help          Show this message

Flags (override .env / environment):
  --host <ip>                     ZK_DEVICE_HOST          (required)
  --port <n>                      ZK_DEVICE_PORT          (default 4370)
  --device-id <n>                 ZK_DEVICE_ID            (machine number, default 1)
  --comm-key <n>                  ZK_COMM_KEY             (default 0, never logged)
  --expected-serial <serial>      ZK_EXPECTED_SERIAL      (warn-only comparison)
  --clock-drift-warn-seconds <n>  ZK_CLOCK_DRIFT_WARN_SECONDS (default 60)
  --worker-path <path>            ZK_WORKER_PATH          (x86 worker executable)
  --worker-timeout <ms>           ZK_WORKER_TIMEOUT_MS    (default 300000)
  --output-dir <path>             ZK_OUTPUT_DIR           (default ./output)
  --limit <n>                     ZK_ATTENDANCE_LIMIT     (0 = save everything)
  --log-level <level>             ZK_LOG_LEVEL            (debug|info|warn|error|silent)
  --log-format <format>           ZK_LOG_FORMAT           (pretty|json)
  --no-write                      Run without writing any JSON
  --method <substring>            capabilities: dump only matching signatures
  --confirm-read-only             probe-latest-log: acknowledge the unknown-side-effect
                                  risk. Flag only — never read from .env.

This tool never reads fingerprint templates, fingerprint images, face templates
or any other biometric data, never retains device passwords, and never modifies
the device.
`.trimStart();

async function main(): Promise<number> {
  const invocation: CliInvocation = parseCli(process.argv.slice(2));

  if (invocation.command === 'help' || invocation.flags.has('help')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const command = COMMANDS[invocation.command];
  if (!command) {
    process.stderr.write(`Unknown command "${invocation.command}".\n\n`);
    process.stdout.write(USAGE);
    return 2;
  }

  const envPath = loadEnvFile();
  const config = resolveConfig(invocation);
  const logger = createLogger({ level: config.logLevel, format: config.logFormat });

  if (envPath) logger.debug('config.envFile.loaded', { path: envPath });

  return command.run({ config, logger });
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((thrown: unknown) => {
    process.exitCode = 1;
    const stderr = process.stderr;

    if (isZkPocError(thrown)) {
      stderr.write(`\n${thrown.code}\n\n${thrown.message}\n`);
      if (thrown.systemCode) stderr.write(`\nSystem error code: ${thrown.systemCode}\n`);
      if (thrown.remediation.length > 0) {
        stderr.write('\nVerify:\n');
        for (const hint of thrown.remediation) stderr.write(`- ${hint}\n`);
      }
      stderr.write('\n');
      return;
    }

    const { message, systemCode } = describeThrown(thrown);
    stderr.write(`\nUNKNOWN_ERROR\n\n${message}\n`);
    if (systemCode) stderr.write(`\nSystem error code: ${systemCode}\n`);
    stderr.write('\nRe-run with --log-level debug for the worker-level detail.\n\n');
  });
