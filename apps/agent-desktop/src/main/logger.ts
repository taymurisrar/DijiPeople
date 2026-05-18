import { app } from "electron";
import { appendFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { agentEnv } from "../config/env";

const MAX_LOG_BYTES = agentEnv.logMaxBytes;
const MAX_LOG_FILES = agentEnv.logMaxFiles;

export class AgentLogger {
  private readonly logsDir = agentEnv.logsPath || app.getPath("logs");
  private readonly logFile = path.join(this.logsDir, "agent.log");
  private writeChain: Promise<void> = Promise.resolve();

  info(event: string, data?: Record<string, unknown>) {
    this.write("INFO", event, data);
  }

  warn(event: string, data?: Record<string, unknown>) {
    this.write("WARN", event, data);
  }

  error(event: string, data?: Record<string, unknown>) {
    this.write("ERROR", event, data);
  }

  getLogFilePath() {
    return this.logFile;
  }

  private write(level: "INFO" | "WARN" | "ERROR", event: string, data?: Record<string, unknown>) {
    const safeData = redact(data);
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(safeData ? { data: safeData } : {}),
    });

    this.writeChain = this.writeChain
      .then(async () => {
        await mkdir(this.logsDir, { recursive: true });
        await this.rotateIfNeeded();
        await appendFile(this.logFile, `${line}\n`, "utf8");
      })
      .catch(() => undefined);
  }

  private async rotateIfNeeded() {
    const current = await stat(this.logFile).catch(() => null);
    if (!current || current.size < MAX_LOG_BYTES) return;

    const rotated = path.join(this.logsDir, `agent-${Date.now()}.log`);
    await rename(this.logFile, rotated);

    const rotatedFiles = (await readdir(this.logsDir))
      .filter((file) => /^agent-\d+\.log$/.test(file))
      .sort();

    const overflow = rotatedFiles.slice(0, Math.max(0, rotatedFiles.length - MAX_LOG_FILES));
    await Promise.all(overflow.map((file) => unlink(path.join(this.logsDir, file)).catch(() => undefined)));
  }
}

function redact(input?: Record<string, unknown>) {
  if (!input) return undefined;

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (/token|password|secret|authorization/i.test(key)) {
        return [key, "[REDACTED]"];
      }
      return [key, value];
    }),
  );
}
