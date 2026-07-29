import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const port = Number(process.argv[2] ?? process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`Invalid port: ${process.argv[2] ?? process.env.PORT}`);
  process.exit(1);
}

const pids = platform() === "win32"
  ? await findWindowsPids(port)
  : await findUnixPids(port);

for (const pid of pids) {
  if (pid === process.pid) continue;
  await killPid(pid);
}

if (pids.size > 0) {
  console.log(`Freed port ${port}.`);
}

async function findWindowsPids(targetPort) {
  const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"], {
    windowsHide: true,
  });
  const matches = new Set();

  for (const line of stdout.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5) continue;
    const [protocol, localAddress, , state, pid] = columns;
    if (protocol.toUpperCase() !== "TCP" || state !== "LISTENING") continue;
    if (!localAddress.endsWith(`:${targetPort}`)) continue;
    const parsedPid = Number(pid);
    if (Number.isInteger(parsedPid) && parsedPid > 0) {
      matches.add(parsedPid);
    }
  }

  return matches;
}

async function findUnixPids(targetPort) {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-ti",
      `tcp:${targetPort}`,
      "-sTCP:LISTEN",
    ]);
    return new Set(
      stdout
        .split(/\s+/)
        .map(Number)
        .filter((pid) => Number.isInteger(pid) && pid > 0),
    );
  } catch {
    return new Set();
  }
}

async function killPid(pid) {
  if (platform() === "win32") {
    await execFileAsync("taskkill", ["/PID", `${pid}`, "/T", "/F"], {
      windowsHide: true,
    }).catch(() => undefined);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    process.kill(pid, 0);
    process.kill(pid, "SIGKILL");
  } catch {
    // Process already exited.
  }
}
