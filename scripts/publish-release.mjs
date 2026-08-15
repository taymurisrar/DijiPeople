#!/usr/bin/env node
/**
 * Publishes a DijiPeople application release.
 *
 * Replaces the manual sequence that used to follow every gateway build — upload
 * the zip somewhere, copy the storage key, hand-write an ApplicationRelease row
 * — with one command:
 *
 *   build -> package -> checksum -> upload -> register -> verify
 *
 * The upload, registration, verification and compensation all happen server
 * side in ONE request (see ReleasePublisherService). This script's job is to
 * decide *what* is being published and to refuse to publish the wrong thing:
 * it reconciles every place the version is written down, resolves the artefact,
 * checksums it locally, and makes production publishing something you have to
 * ask for by name.
 *
 * Usage:
 *   npm run release:app -- --app integration-gateway --channel beta
 *   npm run release:gateway -- --channel beta --dry-run
 *   npm run release:gateway -- --channel stable --environment production --yes
 *   npm run release:promote -- --app integration-gateway --version 2.0.0 --to stable
 *
 * Credential: DIJIPEOPLE_RELEASE_TOKEN (never a flag — a flag lands in shell
 * history and in CI logs).
 * Target:     DIJIPEOPLE_RELEASE_API_URL, default http://localhost:4000/api
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RELEASE_APPS,
  isValidVersion,
  normalizeChannel,
  normalizeEnvironment,
  parseCliArgs,
  parseMsBuildVersion,
  parsePackageJsonVersion,
  reconcileVersions,
  requiresExplicitConfirmation,
  resolveReleaseApp,
  versionFromArtifactName,
} from "./lib/release-apps.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const BOOLEAN_FLAGS = [
  "dry-run",
  "yes",
  "promote",
  "build",
  "no-build",
  "help",
];

const VALUE_FLAGS = [
  "app",
  "version",
  "channel",
  "artifact",
  "platform",
  "architecture",
  "notes",
  "notes-file",
  "minimum-version",
  "environment",
  "api",
  "to",
  "from",
  "actor",
];

function log(message = "") {
  process.stdout.write(`${message}\n`);
}

function fail(message, hint) {
  process.stderr.write(`\nRelease publishing failed.\n  ${message}\n`);
  if (hint) process.stderr.write(`  ${hint}\n`);
  process.stderr.write("\n");
  process.exit(1);
}

function usage() {
  log(`
DijiPeople release publisher

  npm run release:app -- --app <app> --channel <channel> [options]
  npm run release:promote -- --app <app> --version <x.y.z> --to <channel>

Applications
${RELEASE_APPS.map((app) => `  ${app.alias.padEnd(20)} ${app.label}`).join("\n")}

Options
  --app <alias>              Application to publish.
  --channel <internal|beta|stable>
  --version <x.y.z>          Defaults to the app's canonical version source.
  --artifact <path>          Pre-built package. Defaults to the packaging output.
  --platform / --architecture  Default to the app's target.
  --notes <text> | --notes-file <path>
  --minimum-version <x.y.z>  Oldest version that may upgrade to this one.
  --environment <development|staging|production>
                             Required for production. Verified against the API.
  --api <url>                Target API base URL. Default: DIJIPEOPLE_RELEASE_API_URL.
  --build / --no-build       Force or skip packaging. Default: build only if the
                             artefact is missing.
  --dry-run                  Validate, package and checksum. Upload nothing,
                             change nothing.
  --yes                      Confirm a production or STABLE publish
                             non-interactively.
  --actor <label>            Who published, for the audit trail.
                             Default: a CI run reference, or user@host.

Promotion
  --promote --to <channel> [--from <channel>]
                             Moves an already-published artefact into a wider
                             channel WITHOUT rebuilding it.

Credential
  DIJIPEOPLE_RELEASE_TOKEN   Required. Never passed as a flag.
`);
}

// ---------------------------------------------------------------- arguments

const { values, unknown } = parseCliArgs(process.argv.slice(2), {
  booleanFlags: BOOLEAN_FLAGS,
});

if (values.help) {
  usage();
  process.exit(0);
}

if (unknown.length > 0) {
  fail(
    `Unrecognised or incomplete argument(s): ${unknown.join(", ")}`,
    "Run with --help for the accepted flags.",
  );
}

const recognised = new Set([...BOOLEAN_FLAGS, ...VALUE_FLAGS]);
const strays = Object.keys(values).filter((key) => !recognised.has(key));
if (strays.length > 0) {
  fail(
    `Unknown option(s): ${strays.map((key) => `--${key}`).join(", ")}`,
    "Run with --help for the accepted flags. Nothing was published.",
  );
}

const app = resolveReleaseApp(values.app);
if (!app) {
  fail(
    `--app is required and must be one of: ${RELEASE_APPS.map((entry) => entry.alias).join(", ")}`,
  );
}

const isPromotion = values.promote === true || Boolean(values.to);
const dryRun = values["dry-run"] === true;

const apiBaseUrl = String(
  values.api ??
    process.env.DIJIPEOPLE_RELEASE_API_URL ??
    "http://localhost:4000/api",
).replace(/\/+$/, "");

// Resolved BEFORE the credential check, deliberately. A developer whose shell
// carries a production environment should be told that first — it is the
// mistake worth catching, and it is true whether or not they have a token.
const environment = resolveEnvironment();

const token = String(process.env.DIJIPEOPLE_RELEASE_TOKEN ?? "").trim();
if (!token && !dryRun) {
  fail(
    "DIJIPEOPLE_RELEASE_TOKEN is not set.",
    "Set it from the target environment's RELEASE_PUBLISH_TOKEN. Do not pass it as an argument.",
  );
}

const actorLabel = resolveActorLabel();

// ----------------------------------------------------------------- helpers

function resolveEnvironment() {
  if (values.environment) {
    const normalized = normalizeEnvironment(values.environment);
    if (!normalized) {
      fail(
        `--environment "${values.environment}" is not one of: development, staging, production.`,
      );
    }
    return normalized;
  }

  // Deliberately NOT inherited from the shell for production. An inherited
  // PLATFORM_ENVIRONMENT=production is exactly the accident this guards
  // against, so production must be typed out.
  const inherited = normalizeEnvironment(
    process.env.PLATFORM_ENVIRONMENT ?? process.env.NODE_ENV,
  );

  if (inherited === "production") {
    fail(
      "This shell's environment says production, but --environment was not given.",
      "Publishing to production must be explicit: re-run with --environment production.",
    );
  }

  return inherited ?? "development";
}

function resolveActorLabel() {
  if (values.actor) return String(values.actor).slice(0, 200);
  if (process.env.GITHUB_RUN_ID) {
    return `github-actions:${process.env.GITHUB_REPOSITORY ?? "unknown"}#${process.env.GITHUB_RUN_ID}`;
  }
  const user =
    process.env.USER ?? process.env.USERNAME ?? process.env.LOGNAME ?? "unknown";
  const host = process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "local";
  return `cli:${user}@${host}`;
}

function readIfPresent(relativePath) {
  const absolute = resolve(REPO_ROOT, relativePath);
  if (!existsSync(absolute)) return undefined;
  // Windows PowerShell 5.1 writes UTF-8 WITH a byte-order mark, and
  // release-metadata.json is written by publish.ps1. JSON.parse rejects a
  // leading BOM, so stripping it here is what lets the metadata written on a
  // build machine be read by the publisher running on the same machine.
  return readFileSync(absolute, "utf8").replace(/^﻿/, "");
}

/** The app's canonical version, from the single file that owns it. */
function readCanonicalVersion() {
  const source = app.versionSource;
  if (!source) return undefined;
  const contents = readIfPresent(source.file);
  if (contents === undefined) return undefined;
  return source.kind === "package-json"
    ? parsePackageJsonVersion(contents)
    : parseMsBuildVersion(contents);
}

function readMetadata() {
  if (!app.metadataFile) return undefined;
  const contents = readIfPresent(app.metadataFile);
  if (contents === undefined) return undefined;
  try {
    return JSON.parse(contents);
  } catch {
    fail(`${app.metadataFile} is not valid JSON.`);
  }
}

function findPackagedArtifact() {
  if (!app.artifactDirectory || !app.artifactPattern) return undefined;
  const directory = resolve(REPO_ROOT, app.artifactDirectory);
  if (!existsSync(directory)) return undefined;

  const candidates = readdirSync(directory)
    .filter((name) => app.artifactPattern.test(name))
    .map((name) => join(directory, name));

  if (candidates.length === 0) return undefined;
  if (candidates.length > 1) {
    // More than one package in the output directory means a stale build is
    // still sitting there. Picking the newest would publish whichever the
    // filesystem happened to prefer.
    fail(
      `${app.artifactDirectory} contains more than one package:\n    ${candidates.map((path) => basename(path)).join("\n    ")}`,
      "Clean the directory or pass --artifact explicitly.",
    );
  }

  return candidates[0];
}

function runPackaging() {
  if (!app.packageCommand) {
    fail(
      `There is no repository packaging command for ${app.label}.`,
      "Build it in its own workspace and pass the result with --artifact.",
    );
  }

  if (app.packageCommand.requiresWindows && process.platform !== "win32") {
    fail(
      `${app.label} packages only on Windows (PowerShell + a Windows .NET publish).`,
      "Build on Windows, or run this with --artifact pointing at a package built there.",
    );
  }

  log(`Packaging ${app.label}…`);
  const result = spawnSync(
    app.packageCommand.command,
    app.packageCommand.args,
    { cwd: REPO_ROOT, stdio: "inherit", shell: process.platform === "win32" },
  );

  if (result.error) {
    fail(`Packaging could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`Packaging failed with exit code ${result.status}.`);
  }
}

/**
 * Asks for the version to be typed back, not for a y/n.
 *
 * A yes/no prompt is answered reflexively. Typing "2.0.0" requires having read
 * which version is about to go to production.
 */
async function confirmInteractively({ version, message }) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    log("");
    log(message);
    const answer = await readline.question(
      `Type the version (${version}) to confirm, or anything else to abort: `,
    );
    return answer.trim() === version;
  } finally {
    readline.close();
  }
}

async function postToPublisher(path, body, { multipart = false } = {}) {
  const headers = {
    "x-dijipeople-release-token": token,
    "x-dijipeople-release-actor": actorLabel,
  };
  if (!multipart) headers["content-type"] = "application/json";

  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers,
      body: multipart ? body : JSON.stringify(body),
    });
  } catch (error) {
    fail(
      `Could not reach the release API at ${apiBaseUrl}: ${error.message}`,
      "Check --api / DIJIPEOPLE_RELEASE_API_URL and that the API is running.",
    );
  }

  return handleResponse(response);
}

async function handleResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { message: text.slice(0, 500) };
  }

  if (!response.ok) {
    const details = payload?.details ?? payload?.error?.details;
    fail(
      `${response.status} ${payload?.errorCode ?? ""} ${payload?.message ?? "The release API rejected the request."}`.trim(),
      details ? `Details: ${JSON.stringify(details)}` : payload?.description,
    );
  }

  return payload;
}

function printOutcome(result) {
  const release = result?.release ?? {};
  log("");
  log(`Outcome     ${result?.outcome ?? "UNKNOWN"}`);
  log(`Environment ${result?.environment ?? environment}`);
  log(`App         ${release.appKey ?? app.appKey}`);
  log(`Version     ${release.version ?? ""}`);
  log(`Channel     ${release.channel ?? ""}`);
  log(`Platform    ${release.platform ?? ""} / ${release.architecture ?? ""}`);
  if (release.fileName) log(`File        ${release.fileName}`);
  if (release.fileSizeBytes) {
    log(`Size        ${(release.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`);
  }
  if (release.checksumSha256) log(`SHA-256     ${release.checksumSha256}`);
  if (release.id) log(`Release id  ${release.id}`);
  if (release.downloadPath) log(`Download    ${release.downloadPath}`);
  log(`Artefact    ${result?.artifactAvailable ? "retrievable" : "NOT retrievable"}`);
  if (result?.note) log(`Note        ${result.note}`);
  if (result?.message) log(`Note        ${result.message}`);
  log("");
}

/**
 * Confirms the release is visible through the normal catalogue path.
 *
 * Reads back through the publisher's verification route rather than trusting the
 * publish response — the same route a CI job would use to assert a release
 * landed, and it never streams the artefact.
 */
async function verifyPublished(version, channel) {
  const query = new URLSearchParams({
    app: app.appKey,
    version,
    channel,
  });

  const response = await fetch(
    `${apiBaseUrl}/app-releases/publisher/releases?${query.toString()}`,
    { headers: { "x-dijipeople-release-token": token } },
  ).catch((error) => {
    fail(`Verification read-back could not reach the API: ${error.message}`);
  });

  const payload = await handleResponse(response);
  const match = payload.items?.find(
    (item) => item.version === version && item.channel === channel,
  );

  if (!match) {
    fail(
      `The release was reported published but ${channel} ${version} was not found on read-back.`,
      `Inspect it through GET /app-releases/publisher/releases?app=${app.appKey}.`,
    );
  }

  if (!match.artifactAvailable) {
    fail(
      `${channel} ${version} is registered but its artefact is not retrievable from storage.`,
      `Disable it (POST /app-releases/${match.id}/disable) and investigate before announcing this release.`,
    );
  }

  return match;
}

// ------------------------------------------------------------------ promote

async function promote() {
  const toChannel = normalizeChannel(values.to);
  if (!toChannel) {
    fail("--to must be one of: internal, beta, stable.");
  }
  const fromChannel = values.from ? normalizeChannel(values.from) : undefined;
  if (values.from && !fromChannel) {
    fail("--from must be one of: internal, beta, stable.");
  }

  const version = String(values.version ?? readCanonicalVersion() ?? "").trim();
  if (!isValidVersion(version)) {
    fail("--version is required for a promotion and must be MAJOR.MINOR.PATCH.");
  }

  const confirmation = requiresExplicitConfirmation({
    environment,
    channel: toChannel,
    assumeYes: values.yes === true,
    interactive: Boolean(process.stdin.isTTY),
  });

  if (confirmation.required) {
    if (confirmation.reason !== "interactive-confirmation") {
      fail(confirmation.reason);
    }
    const confirmed = await confirmInteractively({
      version,
      message: `About to promote ${app.label} ${version} to ${toChannel} on ${environment}.`,
    });
    if (!confirmed) fail("Aborted. Nothing was promoted.");
  }

  log("");
  log(`Promoting ${app.label} ${version} -> ${toChannel} (${environment})`);
  if (dryRun) log("DRY RUN — nothing will be created or modified.");

  const result = await postToPublisher("/app-releases/publisher/promote", {
    app: app.appKey,
    version,
    toChannel,
    ...(fromChannel ? { fromChannel } : {}),
    platform: values.platform ?? app.platform,
    architecture: values.architecture ?? app.architecture,
    ...(values.notes ? { releaseNotes: String(values.notes) } : {}),
    environment,
    ...(dryRun ? { dryRun: "true" } : {}),
  });

  printOutcome(result);

  if (!dryRun) {
    await verifyPublished(version, toChannel);
    log("Verified: the promoted release reads back with a retrievable artefact.");
  }
}

// ------------------------------------------------------------------ publish

async function publish() {
  const channel = normalizeChannel(values.channel);
  if (!channel) {
    fail("--channel is required and must be one of: internal, beta, stable.");
  }

  // --- artefact -----------------------------------------------------------

  let artifactPath = values.artifact
    ? resolve(REPO_ROOT, String(values.artifact))
    : findPackagedArtifact();

  const forceBuild = values.build === true;
  const skipBuild = values["no-build"] === true;

  if (forceBuild && skipBuild) {
    fail("--build and --no-build contradict each other.");
  }

  // Default: package only when there is nothing to publish. CI that already
  // built in a previous step passes --no-build and does not pay for a rebuild.
  if (forceBuild || (!artifactPath && !skipBuild && !values.artifact)) {
    runPackaging();
    artifactPath = findPackagedArtifact();
  }

  if (!artifactPath || !existsSync(artifactPath)) {
    fail(
      "No artefact to publish.",
      app.packageCommand
        ? "Run the packaging step first, or pass --artifact <path>."
        : "Pass --artifact <path>.",
    );
  }

  const stats = statSync(artifactPath);
  if (!stats.isFile() || stats.size === 0) {
    fail(`${artifactPath} is empty or is not a file.`);
  }

  // --- version reconciliation --------------------------------------------

  const metadata = readMetadata();
  const reconciliation = reconcileVersions({
    "--version": values.version,
    [`${app.versionSource?.file ?? "canonical source"} (canonical)`]:
      readCanonicalVersion(),
    [app.metadataFile ?? "release metadata"]: metadata?.version,
    [basename(artifactPath)]: versionFromArtifactName(
      app,
      basename(artifactPath),
    ),
  });

  if (!reconciliation.ok) {
    fail(reconciliation.error, "Nothing was uploaded.");
  }

  const version = reconciliation.version;

  // --- checksum -----------------------------------------------------------

  const artifact = readFileSync(artifactPath);
  const checksum = createHash("sha256").update(artifact).digest("hex");

  if (
    metadata?.checksumSha256 &&
    String(metadata.checksumSha256).toLowerCase() !== checksum
  ) {
    fail(
      `${app.metadataFile} records a different checksum than the artefact on disk.`,
      "The package and its metadata are out of step. Re-run the packaging step.",
    );
  }

  const releaseNotes = values["notes-file"]
    ? readFileSync(resolve(REPO_ROOT, String(values["notes-file"])), "utf8")
    : values.notes
      ? String(values.notes)
      : undefined;

  const minimumSupportedVersion = values["minimum-version"]
    ? String(values["minimum-version"])
    : undefined;

  if (minimumSupportedVersion && !isValidVersion(minimumSupportedVersion)) {
    fail("--minimum-version must be MAJOR.MINOR.PATCH.");
  }

  log("");
  log(`Application  ${app.label} (${app.appKey})`);
  log(`Version      ${version}`);
  log(`Channel      ${channel}`);
  log(`Environment  ${environment}`);
  log(`Target       ${apiBaseUrl}`);
  log(`Artefact     ${artifactPath}`);
  log(`Size         ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  log(`SHA-256      ${checksum}`);

  if (dryRun) {
    log("");
    log("DRY RUN — the package was built, resolved and checksummed.");
    log("Nothing was uploaded and no release record was created or modified.");

    if (!token) {
      log("");
      log(
        "DIJIPEOPLE_RELEASE_TOKEN is unset, so the server-side dry run was skipped.",
      );
      return;
    }
  }

  // --- confirmation -------------------------------------------------------

  if (!dryRun) {
    const confirmation = requiresExplicitConfirmation({
      environment,
      channel,
      assumeYes: values.yes === true,
      interactive: Boolean(process.stdin.isTTY),
    });

    if (confirmation.required) {
      if (confirmation.reason !== "interactive-confirmation") {
        fail(confirmation.reason);
      }
      const confirmed = await confirmInteractively({
        version,
        message: `About to publish ${app.label} ${version} to ${channel} on ${environment}.`,
      });
      if (!confirmed) fail("Aborted. Nothing was published.");
    }
  }

  // --- upload, register, verify (one request) -----------------------------

  const form = new FormData();
  form.append(
    "artifact",
    new Blob([artifact], { type: "application/octet-stream" }),
    basename(artifactPath),
  );
  form.append("app", app.appKey);
  form.append("version", version);
  form.append("channel", channel);
  form.append("platform", String(values.platform ?? app.platform));
  form.append("architecture", String(values.architecture ?? app.architecture));
  form.append("checksumSha256", checksum);
  form.append("environment", environment);
  if (releaseNotes) form.append("releaseNotes", releaseNotes);
  if (minimumSupportedVersion) {
    form.append("minimumSupportedVersion", minimumSupportedVersion);
  }
  if (dryRun) form.append("dryRun", "true");

  log("");
  log(dryRun ? "Validating against the release API…" : "Uploading and registering…");

  const result = await postToPublisher(
    "/app-releases/publisher/publish",
    form,
    { multipart: true },
  );

  printOutcome(result);

  if (dryRun) return;

  await verifyPublished(version, channel);
  log("Verified: the release reads back with a retrievable artefact.");
  log(
    `It is now visible in Apps & Downloads to anyone whose channel and permission allow ${channel}.`,
  );
  log(
    "Tenants receive it according to their own TenantAppAssignment policy — publishing assigns nothing.",
  );
}

// --------------------------------------------------------------------- main

try {
  await (isPromotion ? promote() : publish());
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
