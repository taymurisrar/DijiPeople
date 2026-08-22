---
ID: BUG-0079
aliases: [BUG-0079]
Title: Browser e2e spends its whole install step on apt work that installs no browser library
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-08-19
DetectedInSha: e6f4cbe
AffectedModules: [.github/workflows, e2e]
OwnerAgent: release-devops
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-069
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-20
---

# BUG-0079 — Browser e2e spends its whole install step on apt work that installs no browser library

## Summary

`browser-e2e` installed its browser with `playwright install --with-deps
chromium`. On `ubuntu-latest` that command spent between 97% and 99% of the step
inside `apt`, and `apt` installed **no browser library at all** — every one was
already present on the runner image. The only packages it added were fonts. The
cost was not fixed either: it ranged from 20 seconds to **25 minutes 55 seconds**
depending entirely on how fast Azure's Ubuntu mirror happened to be, and at the
top of that range it consumed the job's whole 30-minute timeout and failed the
required gate.

## Expected Behavior

The install step downloads the browser and finishes. Its duration should be
governed by the ~300 MB browser download from `cdn.playwright.dev`, which
completes in about ten seconds on a GitHub runner, and should not vary by two
orders of magnitude between runs.

## Actual Behavior

The step ran for 3–26 minutes, dominated by `apt-get update` and `apt-get
install` against a mirror delivering roughly 90–160 kB/s. The browser journeys
had not begun.

## Reproduction

1. Push any commit that does not hit the CI evidence-reuse path.
2. Open the `Browser e2e` job, step **Install the browser**.
3. Observe `Installing dependencies...`, then `apt` fetching from
   `http://azure.archive.ubuntu.com/ubuntu`, before any Playwright download line
   appears.

## Evidence

Run `32294710633`, job `96203568641` — a 314 second step, timestamped from the
job log:

```
19:49:09  Installing dependencies...                   apt begins
19:50:23  Fetched 11.4 MB in 1min 10s (162 kB/s)       apt-get update      74s
19:54:08  Fetched 21.1 MB in 3min 45s (93.8 kB/s)      apt-get install    229s
19:54:12  Downloading Chrome for Testing 151.0.7922.34
19:54:22  Chrome Headless Shell downloaded             browser download   9.6s
```

What `apt` reported it had to do:

```
libasound2t64 is already the newest version (1.2.11-1ubuntu0.3).
libatk-bridge2.0-0t64 is already the newest version (2.52.0-1build1).
libcups2t64 … libdbus-1-3 … libdrm2 … libgbm1 … libglib2.0-0t64 … libnspr4 …
libnss3 … libpango-1.0-0 … libx11-6 … libxcb1 … libxcomposite1 … libxdamage1 …
libxext6 … libxfixes3 … libxkbcommon0 … libxrandr2 … xvfb … libfontconfig1 …
libfreetype6 … fonts-liberation … fonts-noto-color-emoji
                                        — all "already the newest version"

0 upgraded, 9 newly installed, 0 to remove and 23 not upgraded.
  fonts-freefont-ttf fonts-ipafont-gothic fonts-tlwg-loma-otf fonts-unifont
  fonts-wqy-zenhei xfonts-cyrillic xfonts-encodings xfonts-scalable xfonts-utils
```

Every runtime library Chromium links against was already installed. The nine
newly-installed packages are font and X-font-utility packages.

Step duration across the 25 most recent runs that reached it:

| Runs | `Install the browser` |
|---|---|
| 18 runs | 17s – 36s |
| `32186211469` | 89s |
| `32186310981` | 130s |
| `32294138786` | 176s |
| `32294710633` | 314s |
| `32182849325` | **1555s** — consumed the 30-minute cap, gate failed |

`RUNNER_IMAGE` Ubuntu 24.04 (noble) · `PLAYWRIGHT_VERSION` 1.62.1 ·
`PLAYWRIGHT_COMMAND` `playwright install --with-deps chromium`.

## Root Cause

Two independent facts compound.

1. **`--with-deps` is unnecessary on this image.** `ubuntu-latest` already ships
   every library `playwright install-deps chromium` would install. The command
   still runs `apt-get update` — 11.4 MB of package lists — before discovering
   there is nothing to do.
2. **The fonts it does install buy this suite nothing.** They exist so
   screenshots render CJK, Cyrillic and Thai text accurately. `e2e/tests/`
   contains no `toHaveScreenshot` and no `toMatchSnapshot`; every assertion is
   functional. The image already carries `fontconfig`, `fonts-liberation` and
   `fonts-noto-color-emoji`, so Latin rendering is unchanged.

The variance is `EXTERNAL_APT_MIRROR_LATENCY`. Azure's Ubuntu mirror throughput
is not ours to control, which is an argument for not depending on it rather than
for replacing it — repointing `sources.list` at a different mirror would trade a
slow dependency for a fragile one.

This is distinct from, and was masked by, the Playwright browser cache added and
removed on 2026-08-18/19. That cache was worse for its own reason, and removing
it restored the 20–30s **median** — but the tail was always the apt mirror, and
removing the cache did nothing about it.

## Impact

`browser-e2e` is a required gate. Every push paid the apt cost, and on a bad
mirror day the job exhausted its 30-minute timeout and failed the gate for a
reason unrelated to any change in the commit. From the gate's point of view that
failure is indistinguishable from a real browser regression.

## Affected Areas

`.github/workflows/ci.yml` (`browser-e2e`), `e2e/package.json`,
`scripts/install-browser.mjs`.

## Proposed Resolution

Drop `--with-deps`, but **verify rather than assume** the libraries are present,
so a future runner image that stops shipping one fails with a clear message
instead of an inexplicable launch error inside a journey.

No ExecPlan: one script, one npm script, one workflow comment.

## Acceptance Criteria

- `Install the browser` performs no `apt` work on a runner that already
  satisfies the browser.
- The step emits `PLAYWRIGHT_COMMAND`, `APT_DEPENDENCY_DURATION`,
  `CHROMIUM_DOWNLOAD_DURATION`, `TOTAL_BROWSER_INSTALL_DURATION`,
  `RUNNER_IMAGE` and `PLAYWRIGHT_VERSION` — so the next regression is read from
  a measurement rather than inferred from one total.
- A missing system library fails the install step by name and recovers by
  installing dependencies, rather than failing a browser journey.
- `PLAYWRIGHT_INSTALL_DURATION` under two minutes.
- `browser-e2e` still passes.

## Regression Coverage

The launch probe inside `scripts/install-browser.mjs` is the regression test,
and it is deliberately not a separate suite: it fails if the browser cannot
actually start, which is the only thing `--with-deps` was protecting, and it
runs on every CI run rather than whenever someone remembers to invoke it.

`STEP_DURATION_REGRESSION` in `scripts/ci-metrics.mjs` covers the other half —
the step growing again without anything failing.

## Dependencies

None.

## Related Items

[[ITEM-0047]] · [[ITEM-0034]] · [[qa-and-ci-architecture]] · REG-069 (regression register)

## Resolution

`scripts/install-browser.mjs` replaces the bare Playwright invocation:

```
npx playwright install chromium        measured
launch probe (real chromium.launch)    proves the libraries are present
npx playwright install-deps chromium   ONLY if the probe failed, with a warning
```

`e2e/package.json` `install:browsers` now calls it, and the metrics land in the
job summary on every run.

The recovery path is what makes dropping the flag safe. The outcome is
deterministic either way — the job always ends with a browser that launches —
and only the cost differs.

Measured locally, script end to end, browser already downloaded:

```
PLAYWRIGHT_COMMAND              playwright install chromium
APT_DEPENDENCY_DURATION         0s (skipped — runner image already satisfied the browser)
CHROMIUM_DOWNLOAD_DURATION      4.4s
LAUNCH_PROBE_DURATION           4.6s
TOTAL_BROWSER_INSTALL_DURATION  14.6s
LAUNCH_PROBE                    PASS
```

## QA Retest

Verified in CI, run `32307298504`, job `96242923626`. The step reports its own
metrics, so this is measured rather than inferred:

```
PLAYWRIGHT_COMMAND              playwright install chromium
APT_DEPENDENCY_DURATION         0s (skipped — runner image already satisfied the browser)
CHROMIUM_DOWNLOAD_DURATION      9.8s
LAUNCH_PROBE_DURATION           2s
TOTAL_BROWSER_INSTALL_DURATION  12.6s
RUNNER_IMAGE                    Ubuntu 24.04.4 LTS · ubuntu24 · 20260816.277.1
PLAYWRIGHT_VERSION              Version 1.62.1
LAUNCH_PROBE                    PASS
```

**13 seconds**, against 314s on run 32294710633 and 1555s at worst — and below
even the 27s pre-cache baseline, because apt is gone rather than merely faster.

`LAUNCH_PROBE PASS` is the part that matters most. It is not an assumption that
`ubuntu-latest` still ships the libraries; the step started a real browser,
opened a page and closed it. `Browser e2e` then passed 56 journeys in 5.5
minutes.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-069 names `scripts/install-browser.mjs`, `scripts/ci-metrics.mjs`, and that is what was executed.

```text
node <script>   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-19 — created from reviewer at `e6f4cbe`.
- 2026-08-20 — root cause established from run 32294710633 job logs; fixed by
  `scripts/install-browser.mjs`; triaged `FIX_NOW`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[qa-and-ci-architecture]]
- Regression — REG-069 (see the regression register)

<!-- GRAPH:END -->
