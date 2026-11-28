import assert from 'node:assert/strict';
import test from 'node:test';

import { candidatePaths, needsShell, resolveClaudeExecutable } from './lib/claude-executable.mjs';

const winEnv = { USERPROFILE: 'C:\\Users\\hp', PATH: 'C:\\Windows;C:\\Tools' };

test('finds the installed binary even when PATH does not contain it', () => {
  const expected = 'C:\\Users\\hp\\.local\\bin\\claude.exe';
  const found = resolveClaudeExecutable(winEnv, 'win32', (p) => p === expected);
  assert.equal(found, expected);
});

test('an explicit CLAUDE_CLI_PATH wins over everything', () => {
  const env = { ...winEnv, CLAUDE_CLI_PATH: 'D:\\x\\claude.exe' };
  assert.equal(candidatePaths(env, 'win32')[0], 'D:\\x\\claude.exe');
});

test('a missing binary throws instead of pretending to run', () => {
  assert.throws(() => resolveClaudeExecutable(winEnv, 'win32', () => false), /not found/);
});

test('only cmd shims use a shell', () => {
  assert.equal(needsShell('C:\\a\\claude.exe', 'win32'), false);
  assert.equal(needsShell('C:\\a\\claude.cmd', 'win32'), true);
  assert.equal(needsShell('/usr/bin/claude', 'linux'), false);
});
