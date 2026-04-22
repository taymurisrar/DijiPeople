import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const [, , command = "dev", defaultPort = "3000"] = process.argv;
const resolvedPort = process.env.PORT?.trim() || defaultPort;
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
