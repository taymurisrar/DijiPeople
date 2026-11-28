#!/usr/bin/env node
/*
 * Real-Electron privacy journey for the desktop agent (DP-MASTER WP-17 / WP-26.S3).
 *
 *   sign in -> tray says "off" -> "off until you acknowledge the policy"
 *           -> the WHOLE policy opens in a locked window BEFORE the acknowledgement
 *           -> acknowledging turns monitoring on, for that employee only
 *
 * It asserts and exits non-zero on the first failure, so it can gate a pipeline.
 *
 * ISOLATION (read before running):
 *  - It refuses any API that is not on localhost, so it can never drive a real
 *    tenant. Run it against a throwaway database with synthetic users.
 *  - Credentials come from the environment, never from this file:
 *      E2E_AGENT_EMAIL, E2E_AGENT_PASSWORD  a synthetic employee of the test tenant
 *      E2E_AGENT_API_BASE_URL               e.g. http://localhost:4099/api
 *      E2E_ELECTRON_PATH                    path to electron.exe (the npm package's dist)
 *      E2E_AGENT_APP_DIR                    apps/agent-desktop (built: npm run build)
 *      E2E_POLICY_END_MARKER                text at the very end of the TEST policy
 *    The test policy must be published in the THROWAWAY database only (see
 *    seed-dlp-test-policy.cjs). The real monitoring policy stays unpublished.
 *  - A private user-data dir is used and the stored refresh token is deleted at
 *    the end (and at the start), so no session outlives the run.
 *  - The native acknowledgement dialog is answered by the harness (recorded, not
 *    clicked): an OS message box cannot be driven by Playwright.
 *  - Unset ELECTRON_RUN_AS_NODE, or Electron starts as plain Node.
 */
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`FAIL: set ${name}`);
    process.exit(2);
  }
  return value;
}

const apiBase = need('E2E_AGENT_API_BASE_URL');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(apiBase)) {
  console.error('FAIL: refusing a non-local API:', apiBase);
  process.exit(2);
}
const electronPath = need('E2E_ELECTRON_PATH');
const appDir = need('E2E_AGENT_APP_DIR');
const email = need('E2E_AGENT_EMAIL');
const password = need('E2E_AGENT_PASSWORD');
const endMarker = need('E2E_POLICY_END_MARKER');
if (process.env.ELECTRON_RUN_AS_NODE) {
  console.error('FAIL: unset ELECTRON_RUN_AS_NODE');
  process.exit(2);
}

const { _electron } = require(
  require.resolve('playwright', { paths: [appDir, process.cwd()] }),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + JSON.stringify(detail) : ''}`);
}

/*
 * A forwarding proxy in front of the (local) API. The agent talks to the proxy, so
 * the journey can take the server away and bring it back without touching the
 * real API process: the offline checks are about the agent, not about the server.
 */
function createProxy(target) {
  const upstream = new URL(target);
  let server = null;
  const sockets = new Set();
  const start = (port = 0) =>
    new Promise((resolve) => {
      server = http.createServer((req, res) => {
        const forward = http.request(
          {
            host: upstream.hostname,
            port: upstream.port,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: upstream.host },
          },
          (up) => {
            res.writeHead(up.statusCode || 502, up.headers);
            up.pipe(res);
          },
        );
        forward.on('error', () => {
          res.writeHead(502);
          res.end();
        });
        req.pipe(forward);
      });
      server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    });
  const stop = () =>
    new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    });
  return { start, stop };
}

async function clearStoredToken() {
  try {
    const keytar = require(require.resolve('keytar', { paths: [appDir] }));
    await keytar.deletePassword('DijiPeople Agent', 'agent-refresh-token');
  } catch {
    /* keytar not available: nothing stored */
  }
}

(async () => {
  await clearStoredToken();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-agent-e2e-'));
  const proxy = createProxy(new URL(apiBase).origin);
  const proxyPort = await proxy.start();
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [appDir, `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      AGENT_API_BASE_URL: `http://127.0.0.1:${proxyPort}${new URL(apiBase).pathname}`,
      // Short windows so offline behaviour is observable in seconds, not half an hour.
      AGENT_DLP_CONFIG_MAX_AGE_SECONDS: '15',
      AGENT_CONFIG_REFRESH_INTERVAL_SECONDS: '10',
      AGENT_APP_NAME: 'DijiPeople Agent (e2e)',
      AGENT_APP_VERSION: '1.0.0',
      AGENT_ACCESS_TOKEN_TTL: '15m',
      AGENT_REFRESH_TOKEN_TTL: '90d',
      AGENT_UPDATE_URL: 'http://127.0.0.1:9/none',
      AGENT_AUTO_UPDATE_ENABLED: 'false',
    },
    timeout: 60000,
  });
  const lines = [];
  app.process().stdout.on("data", (d) => lines.push(String(d)));
  app.process().stderr.on("data", (d) => lines.push(String(d)));
  try {
    await app.evaluate(({ dialog, Tray }) => {
      globalThis.__dialogs = [];
      dialog.showMessageBox = async (...args) => {
        const o = args[args.length - 1] || {};
        globalThis.__dialogs.push({ message: o.message, buttons: o.buttons });
        return { response: 0, checkboxChecked: false };
      };
      globalThis.__menus = [];
      const original = Tray.prototype.setContextMenu;
      Tray.prototype.setContextMenu = function (menu) {
        globalThis.__menus.push(menu);
        return original.call(this, menu);
      };
    });
    // A frequently-redrawn tray can race Playwright's evaluate; a failed read is
    // just an empty observation, and the polling loops try again.
    const labels = async () => {
      try {
        return await app.evaluate(() =>
          (globalThis.__menus.at(-1)?.items ?? []).map((x) => x.label).filter(Boolean),
        );
      } catch {
        return [];
      }
    };

    const login = await app.firstWindow({ timeout: 60000 });
    await login.waitForLoadState('domcontentloaded');
    await login.fill('#email', email);
    await login.fill('#password', password);
    await login.click('#submit', { noWaitAfter: true }).catch(() => undefined);

    for (let i = 0; i < 60; i += 1) {
      if ((await labels()).some((l) => /acknowledge the policy/i.test(l))) break;
      await sleep(500);
    }
    const before = await labels();
    check('signed in: the tray names the employee', before.some((l) => /Signed in as/.test(l)));
    check(
      'monitoring is off until the policy is acknowledged',
      before.some((l) => /Content monitoring: off until you acknowledge the policy/i.test(l)),
    );

    await app.evaluate(() => {
      const item = globalThis.__menus
        .at(-1)
        .items.find((x) => /Review and acknowledge/i.test(x.label || ''));
      if (item) item.click();
    });
    let policy = null;
    for (let i = 0; i < 40 && !policy; i += 1) {
      await sleep(500);
      policy = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => /polic/i.test(x.getTitle()));
        if (!w) return null;
        const html = decodeURIComponent(
          w.webContents.getURL().replace(/^data:text\/html[^,]*,/, ''),
        );
        // The window exists a moment before its content has loaded.
        if (html.length === 0) return null;
        return {
          chars: html.length,
          dialogsBefore: globalThis.__dialogs.length,
          html,
        };
      });
    }
    check('the policy opens in its own window', !!policy);
    if (policy) {
      check('the whole policy is shown, not truncated', policy.html.includes(endMarker), { chars: policy.chars });
      check('the policy window carries no script', !/<script/i.test(policy.html));
      check('it is shown BEFORE any acknowledgement dialog', policy.dialogsBefore === 0);
      const blocked = await app.evaluate(async ({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => /polic/i.test(x.getTitle()));
        try {
          await w.webContents.executeJavaScript('1+1');
          return false;
        } catch {
          return true;
        }
      });
      check('script execution in the policy window is blocked', blocked);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((x) => /polic/i.test(x.getTitle()))?.close(),
      );
    }

    // The tray settles to the new state once the acknowledgement is recorded.
    let after = [];
    for (let i = 0; i < 60; i += 1) {
      await sleep(500);
      after = await labels();
      if (after.some((l) => /Content monitoring: ON/i.test(l))) break;
    }
    const dialogs = await app.evaluate(() => globalThis.__dialogs);
    check('the acknowledgement dialog came after the policy window', dialogs.length >= 1);
    check(
      'monitoring turns on only after the acknowledgement',
      after.some((l) => /Content monitoring: ON/i.test(l)),
    );

    // ---- offline: the server goes away; capture must stop, and say so.
    await proxy.stop();
    let paused = [];
    for (let i = 0; i < 240; i += 1) {
      await sleep(500);
      paused = await labels();
      if (paused.some((l) => /Content monitoring: paused/i.test(l))) break;
    }
    check(
      'offline: content monitoring pauses once the server has not been heard from recently',
      paused.some((l) => /Content monitoring: paused/i.test(l)),
      paused.filter((l) => /monitoring/i.test(l)),
    );
    check(
      'offline: the tray never claims monitoring is ON while paused',
      !paused.some((l) => /Content monitoring: ON/i.test(l)),
    );

    // ---- back online: capture resumes by itself from a fresh answer.
    await proxy.start(proxyPort);
    let resumed = [];
    for (let i = 0; i < 240; i += 1) {
      await sleep(500);
      resumed = await labels();
      if (resumed.some((l) => /Content monitoring: ON/i.test(l))) break;
    }
    check(
      'back online: monitoring resumes after a fresh config, without another acknowledgement',
      resumed.some((l) => /Content monitoring: ON/i.test(l)),
      resumed.filter((l) => /monitoring/i.test(l)),
    );
    check('no second policy window or dialog was needed to resume', (await app.evaluate(() => globalThis.__dialogs)).length === 1);
  } catch (error) {
    check('journey ran to the end', false, String(error).slice(0, 600));
    console.log(
      lines
        .join('')
        .split('\n')
        .filter((l) => /Agent|rror|login/i.test(l))
        .slice(-12)
        .join('\n'),
    );
  } finally {
    await app.close().catch(() => undefined);
    await proxy.stop().catch(() => undefined);
    await clearStoredToken();
    fs.rmSync(userData, { recursive: true, force: true });
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
