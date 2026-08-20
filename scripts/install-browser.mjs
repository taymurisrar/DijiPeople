#!/usr/bin/env node
/*
 * Installs the Playwright browser the `browser-e2e` job needs, and MEASURES the
 * install instead of leaving one opaque step timer to be interpreted.
 *
 *   npx playwright install chromium     → CHROMIUM_DOWNLOAD_DURATION
 *   launch probe                        → proves the system libraries are there
 *   npx playwright install-deps chromium (only if the probe failed)
 *                                       → APT_DEPENDENCY_DURATION
 *
 * ## Why `--with-deps` was removed
 *
 * `playwright install --with-deps chromium` was the whole step, and on
 * `ubuntu-latest` it spent almost all of its time doing nothing useful.
 * Measured on run 32294710633 (job 96203568641), a 314 second step:
 *
 *   apt-get update            74s   11.4 MB of package lists @ 162 kB/s
 *   apt-get install          229s   21.1 MB @ 93.8 kB/s
 *   browser downloads        9.6s   301 MB from cdn.playwright.dev
 *
 * 97% of the step was apt, and apt installed **zero** browser libraries. The
 * runner image already carries every one of them — libnss3, libgbm1, libdrm2,
 * libatk*, libxkbcommon0, libcups2t64, xvfb and the rest all logged as
 * "already the newest version", `0 upgraded, 0 newly installed` for libraries.
 *
 * The nine packages it did install were fonts: fonts-ipafont-gothic,
 * fonts-wqy-zenhei, fonts-unifont, fonts-tlwg-loma-otf, fonts-freefont-ttf and
 * four xfonts-* packages. Those broaden CJK / Cyrillic / Thai glyph coverage
 * for pixel-accurate screenshots. This suite makes no visual comparison —
 * there is not one `toHaveScreenshot` or `toMatchSnapshot` in `e2e/tests/` —
 * and the image already ships fontconfig, fonts-liberation and
 * fonts-noto-color-emoji, so Latin rendering is unaffected. We were paying
 * three to twenty-five minutes of a slow Azure mirror for glyphs nothing
 * asserts on.
 *
 * The apt work also has no ceiling: the same command took 1555s on run
 * 32182849325. Mirror throughput is external infrastructure we do not control
 * (`EXTERNAL_APT_MIRROR_LATENCY`), which is exactly why the fix is to stop
 * depending on it rather than to point it somewhere else. Rewriting sources to
 * a different mirror would trade a slow dependency for a fragile one.
 *
 * ## Why this is not just "drop the flag"
 *
 * Dropping `--with-deps` outright would make the job silently dependent on the
 * runner image continuing to ship those libraries. When GitHub next slims the
 * image the failure would arrive as a Playwright launch error inside a browser
 * journey, reading as a product defect.
 *
 * So the fast path is verified rather than assumed: after downloading the
 * browser we actually launch it. If it launches, the libraries are present and
 * apt was never needed. If it does not, we run `playwright install-deps` —
 * Playwright's own dependency resolution, so we install exactly what it says is
 * required — and probe again. The outcome is deterministic either way; only the
 * cost differs, and the recovery path announces itself loudly in the summary.
 *
 * Do NOT re-add a cache of `~/.cache/ms-playwright`. It was tried on
 * 2026-08-18 and made the step catastrophically slower (27s → 6m41s → 25m55s);
 * the reasoning is recorded on the job in `.github/workflows/ci.yml`.
 *
 *   node scripts/install-browser.mjs [--browser chromium]
 *
 * Exit codes: 0 installed and verified · 1 the browser could not be launched
 * even after installing dependencies · 2 usage error
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const E2E = join(ROOT, 'e2e');

const argv = process.argv.slice(2);
let browser = 'chromium';
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--browser') {
    browser = argv[i + 1];
    i += 1;
    if (!browser) usage('--browser needs a value');
  } else {
    usage(`unknown argument: ${argv[i]}`);
  }
}

function usage(message) {
  console.error(`install-browser: ${message}`);
  console.error('usage: node scripts/install-browser.mjs [--browser chromium]');
  process.exit(2);
}

/** Seconds, one decimal — the unit every duration below is reported in. */
const since = (startedAt) => Number(((Date.now() - startedAt) / 1000).toFixed(1));

/**
 * Runs a Playwright CLI command, streaming its output so a slow install is
 * visible while it happens rather than only in the post-mortem.
 */
function playwright(args) {
  const startedAt = Date.now();
  const result = spawnSync('npx', ['playwright', ...args], {
    cwd: E2E,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return { seconds: since(startedAt), ok: result.status === 0 };
}

/**
 * Launches the browser for real and closes it again.
 *
 * This is the whole reason `--with-deps` can be dropped safely: a missing
 * system library shows up here, in a step whose name says what it is, instead
 * of two steps later inside a journey where it reads as an application failure.
 */
function probeLaunch() {
  const startedAt = Date.now();
  const script = `
    const { ${browser} } = require('@playwright/test');
    ${browser}.launch()
      .then(async (b) => {
        const page = await (await b.newContext()).newPage();
        await page.setContent('<h1>launch probe</h1>');
        await page.title();
        await b.close();
        process.exit(0);
      })
      .catch((error) => {
        console.error(String(error && error.message ? error.message : error));
        process.exit(1);
      });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: E2E,
    encoding: 'utf8',
    shell: false,
  });
  return {
    seconds: since(startedAt),
    ok: result.status === 0,
    detail: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

/** The runner image, named the way GitHub names it, when we are on one. */
function runnerImage() {
  const parts = [];
  try {
    const release = readFileSync('/etc/os-release', 'utf8');
    const pretty = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(release);
    if (pretty) parts.push(pretty[1]);
  } catch {
    parts.push(`${process.platform} ${process.arch}`);
  }
  if (process.env.ImageOS) parts.push(process.env.ImageOS);
  if (process.env.ImageVersion) parts.push(process.env.ImageVersion);
  return parts.join(' · ') || 'unknown';
}

function playwrightVersion() {
  try {
    return execFileSync('npx', ['playwright', '--version'], {
      cwd: E2E,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim();
  } catch {
    return 'unknown';
  }
}

const totalStartedAt = Date.now();
const RUNNER_IMAGE = runnerImage();
const PLAYWRIGHT_VERSION = playwrightVersion();

console.log(`RUNNER_IMAGE        ${RUNNER_IMAGE}`);
console.log(`PLAYWRIGHT_VERSION  ${PLAYWRIGHT_VERSION}`);

// 1. The browser binaries. This is the part that genuinely has to happen, and
//    on a warm CDN it is the cheap part — ~10s for ~300 MB.
const download = playwright(['install', browser]);
if (!download.ok) {
  console.error('install-browser: downloading the browser failed');
  process.exit(1);
}

// 2. Prove the libraries are there.
let probe = probeLaunch();
let aptSeconds = 0;
let aptRan = false;

// 3. Only if they are not. `install-deps` is Playwright's own resolution of
//    what this browser needs, so we never hand-maintain a package list that
//    drifts from what the browser actually links against.
if (!probe.ok) {
  console.warn('::warning title=Playwright system dependencies were missing::' +
    `The launch probe failed, so apt is running after all. Detail: ${probe.detail.split('\n')[0]}`);
  const deps = playwright(['install-deps', browser]);
  aptSeconds = deps.seconds;
  aptRan = true;
  if (!deps.ok) {
    console.error('install-browser: installing system dependencies failed');
    process.exit(1);
  }
  probe = probeLaunch();
}

const TOTAL = since(totalStartedAt);

const metrics = {
  PLAYWRIGHT_COMMAND: `playwright install ${browser}${aptRan ? ` + playwright install-deps ${browser}` : ''}`,
  APT_DEPENDENCY_DURATION: aptRan ? `${aptSeconds}s` : '0s (skipped — runner image already satisfied the browser)',
  CHROMIUM_DOWNLOAD_DURATION: `${download.seconds}s`,
  LAUNCH_PROBE_DURATION: `${probe.seconds}s`,
  TOTAL_BROWSER_INSTALL_DURATION: `${TOTAL}s`,
  RUNNER_IMAGE,
  PLAYWRIGHT_VERSION,
  LAUNCH_PROBE: probe.ok ? 'PASS' : 'FAIL',
};

for (const [key, value] of Object.entries(metrics)) {
  console.log(`${key.padEnd(32)}${value}`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### Browser install',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    ...Object.entries(metrics).map(([key, value]) => `| \`${key}\` | ${value} |`),
    '',
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

if (!probe.ok) {
  console.error(`install-browser: ${browser} could not be launched even after installing dependencies.`);
  console.error(probe.detail);
  process.exit(1);
}

console.log(`install-browser: ${browser} installed and verified in ${TOTAL}s.`);
