# Publishing an application release

DijiPeople ships three downloadable applications — the Integration Gateway, the
Desktop Agent and the ZKTeco Diagnostic Utility. This describes how a built
artefact becomes a release that Apps & Downloads can serve.

## What changed

Publishing used to be a build followed by four manual steps: upload the zip
somewhere, copy the storage key, hand-write an `ApplicationRelease` row, and
hope the checksum in the row matched the bytes in storage. Every failure mode of
that process left a half-published release — an uploaded object nobody
registered, or a row pointing at an object that never arrived.

It is now one command.

```
build → package → checksum → upload → register → verify
```

The middle four steps happen inside **one API request**, so a failure at any
point can undo the step before it. Nothing is registered that was not uploaded,
and nothing is reported published that could not be read back.

## Commands

```powershell
# Build the package only
npm run package:gateway

# Validate everything without touching storage or the database
npm run release:gateway -- --channel beta --dry-run

# Publish to BETA (packages first if there is no artefact yet)
npm run release:gateway -- --channel beta

# Publish to STABLE in production — confirmation required
npm run release:gateway -- --channel stable --environment production

# Any application, same pipeline
npm run release:app -- --app agent-desktop --channel beta --artifact <path>

# Promote an already-tested artefact into a wider channel, no rebuild
npm run release:promote -- --app integration-gateway --version 2.0.0 --to stable
```

`npm run release:app -- --help` lists every flag.

## Credentials

| Variable | Set on | Purpose |
|---|---|---|
| `RELEASE_PUBLISH_TOKEN` | the API environment | The credential `ReleasePublishTokenGuard` checks. |
| `DIJIPEOPLE_RELEASE_TOKEN` | wherever you publish from | The same value, presented by the CLI. |
| `DIJIPEOPLE_RELEASE_API_URL` | wherever you publish from | Target API base URL, including `/api`. |

The credential is a **machine identity**, not a person's account. It can publish
releases and nothing else — the only routes it opens are the publisher's. This
is deliberately narrower than a platform administrator's session, which is what
putting an admin email and password into CI secrets would have meant.

**An environment with no `RELEASE_PUBLISH_TOKEN` cannot be published to.** The
guard fails closed and there is no development default, so a token that works
locally can never become the one guarding production.

The token is read from the environment only, never from a flag — a flag lands in
shell history and in CI logs. Only the first 12 characters of its SHA-256 reach
the audit trail.

## Safety properties

**A published version is immutable content.** Publishing the same
app + version + platform + architecture + channel twice is:

- **the same artefact** → idempotent success. Nothing is re-uploaded, nothing is
  rewritten, and the pipeline is safe to re-run.
- **a different artefact** → `RELEASE_VERSION_CONFLICT`, and nothing is written.
  A released binary is never silently replaced, because every checksum published
  alongside it would become a lie.

Metadata may still be corrected through the platform-admin `POST /app-releases`
route — notes, minimum supported version — but a content change is refused
there too.

**The checksum is computed from the bytes that arrived**, not the bytes the
publisher claims to have sent. The publisher's own value is compared and never
trusted; a mismatch means the transfer was corrupted and the release is not
registered.

**Publishing to production has to be asked for by name.** `--environment
production` is required — an inherited `PLATFORM_ENVIRONMENT=production` is
refused rather than obeyed — and the API independently rejects a publish whose
declared environment is not the environment it is actually running as.
Production and STABLE also require typing the version back, or `--yes` for
automation.

**Failure is never silent.** If the upload succeeds and registration fails, the
uploaded object is deleted; if that deletion also fails, the response names the
orphaned storage key. If registration succeeds and the read-back does not match,
the publish fails with the release id and the command to disable it.

**Versions come from one place.** For the gateway that is `<Version>` in
`DijiPeople.Gateway.Host.csproj`; the assembly version, the package file name and
`release-metadata.json` all derive from it. The publisher reconciles all of them
and refuses to publish if any two disagree, naming both sides.

## Storage

Artefacts go through `StorageService` under `app-releases/<APP_KEY>/<version>/`.
Nothing is served from a storage URL: the release row holds a `storageKey`, and
downloads stream through the permission-checked `/app-releases/:id/download`
route. Binaries are never committed to Git and never placed inside a web
deployment.

Releases are **not** deleted automatically. A tenant pinned to an old version
still needs its artefact, so retiring a release deactivates the row and leaves
the bytes in place.

## Channels and promotion

`INTERNAL`, `BETA`, `STABLE` — the values `ApplicationReleaseChannel` already
defines. Visibility is decided in `AppReleaseService`: INTERNAL is platform-only,
BETA needs `appDownloads.manage`, STABLE is everyone with `appDownloads.read`
plus whatever the release itself requires.

`ApplicationRelease` is unique on (app, version, platform, architecture,
channel), so **a promotion is a new row, not an edit**. The promoted row reuses
the source's storage key, so STABLE ships the byte-for-byte artefact that was
tested in BETA, and the BETA row stays downloadable for anyone pinned to it.

## Publishing is not assignment

A published release is **global** and available to nobody in particular.
`TenantAppAssignment` — channel, `updatePolicy`, `pinnedRelease`,
`minimumVersion` — decides which tenants become eligible for it. The publisher
never writes one. Publishing that also assigned would push a build to every
customer.

## CI

`.github/workflows/release-app.yml`, `workflow_dispatch` only. It is not
triggered by a push, a tag or a merge: "the tests passed" is not the same
statement as "ship this to customers".

Production runs resolve to the `release-production` GitHub environment, so
required reviewers and branch restrictions apply before the job starts, and the
production credential is not readable by an unapproved run.

## Related

- [`docs/environment-variables.md`](../environment-variables.md) — the variables above
- [`docs/development/ci.md`](ci.md) — the rest of the pipeline
- `gateway/packaging/publish.ps1` — what builds the gateway package
- `services/api/src/modules/app-releases/` — the catalogue and the publisher
- `scripts/publish-release.mjs` — the CLI
