import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";

const require = createRequire(import.meta.url);
const [, , command = "dev", defaultPort = "3000", portEnvKeys = ""] =
  process.argv;
const scopedPortEnvKeys = portEnvKeys
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

function firstPortValue() {
  for (const key of scopedPortEnvKeys) {
    const value = process.env[key]?.trim();
    if (value) return { port: value, source: key };
  }

  const globalPort = process.env.PORT?.trim();
  if (globalPort) return { port: globalPort, source: "PORT" };

  return { port: defaultPort, source: "default" };
}

function assertValidPort(port, source) {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(
      `Invalid port "${port}" from ${source}. Use a number from 1 to 65535.`,
    );
    process.exit(1);
  }
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      resolve({ ok: false, error });
    });

    server.once("listening", () => {
      server.close(() => resolve({ ok: true }));
    });

    server.listen(Number(port));
  });
}

const { port: resolvedPort, source: portSource } = firstPortValue();
assertValidPort(resolvedPort, portSource);

if (command === "dev") {
  const result = await canListen(resolvedPort);

  if (!result.ok && result.error?.code === "EADDRINUSE") {
    const scopedHint = scopedPortEnvKeys.length
      ? ` or set ${scopedPortEnvKeys[0]} to a free port`
      : "";

    console.error(
      [
        `Port ${resolvedPort} is already in use.`,
        `Stop the process using it${scopedHint}, then run the dev command again.`,
        "On Windows, you can inspect it with:",
        `  Get-NetTCPConnection -State Listen -LocalPort ${resolvedPort} | Select-Object LocalAddress,LocalPort,OwningProcess`,
      ].join("\n"),
    );
    process.exit(1);
  }

  if (!result.ok) {
    throw result.error;
  }
}

const nextBin = require.resolve("next/dist/bin/next");
const isDevCommand = command === "dev";
const forceWebpackDev =
  process.env.NEXT_DEV_BUNDLER?.toLowerCase() !== "turbopack";
const extraArgs = isDevCommand && forceWebpackDev ? ["--webpack"] : [];

const child = spawn(
  process.execPath,
  [nextBin, command, "--port", resolvedPort, ...extraArgs],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: resolvedPort,
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
