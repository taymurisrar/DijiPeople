/*
 * Locates the Claude Code executable without relying only on the inherited
 * PATH. VS Code terminals opened before the installer edited PATH, Git Bash and
 * a hook's stripped environment all fail `claude` lookups while the binary is
 * installed, so the resume coordinator resolves it explicitly and fails loudly
 * (never silently "succeeds") when it cannot.
 */
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export function candidatePaths(env = process.env, platform = process.platform) {
  const exe = platform === 'win32' ? 'claude.exe' : 'claude';
  const out = [];
  if (env.CLAUDE_CLI_PATH) out.push(env.CLAUDE_CLI_PATH);
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    out.push(join(dir, exe));
    if (platform === 'win32') out.push(join(dir, 'claude.cmd'));
  }
  const home = env.USERPROFILE ?? env.HOME;
  if (home) {
    out.push(join(home, '.local', 'bin', exe));
    out.push(join(home, '.claude', 'local', exe));
    if (platform === 'win32' && env.APPDATA) out.push(join(env.APPDATA, 'npm', 'claude.cmd'));
  }
  return [...new Set(out)];
}

export function resolveClaudeExecutable(env = process.env, platform = process.platform, exists = existsSync) {
  const found = candidatePaths(env, platform).find((path) => exists(path));
  if (!found) {
    throw new Error(
      'Claude executable not found (set CLAUDE_CLI_PATH or install to ~/.local/bin); refusing to report progress.',
    );
  }
  return found;
}

/** `.cmd` shims need a shell on Windows; a real .exe must not use one (quoting). */
export function needsShell(path, platform = process.platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(path);
}
