/**
 * Build-side knowledge the release publisher needs.
 *
 * WHAT IS AND IS NOT DUPLICATED. The API owns the release CATALOGUE — an app's
 * display name, description and required permission live in
 * `services/api/src/modules/app-releases/release-publisher.constants.ts` and are
 * never sent by the CLI, so they cannot drift. What lives here is strictly
 * build wiring that has no server-side meaning: which command packages an app,
 * where its artefact lands, and which file is the authority on its version.
 *
 * Pure functions only, no filesystem or network, so `node --test` can cover the
 * parsing and version-reconciliation rules that decide what gets published.
 */

export const RELEASE_CHANNELS = ["INTERNAL", "BETA", "STABLE"];
export const RELEASE_ENVIRONMENTS = ["development", "staging", "production"];

/**
 * Applications this repository can package and publish.
 *
 * `versionSource` names the ONE file that decides an app's version. Everything
 * else — the assembly version, the package file name, the metadata document —
 * must agree with it or the publish fails; see `reconcileVersions`.
 */
export const RELEASE_APPS = [
  {
    alias: "integration-gateway",
    appKey: "INTEGRATION_GATEWAY",
    label: "DijiPeople Integration Gateway",
    platform: "WINDOWS",
    architecture: "X64",
    packageCommand: {
      command: "pwsh",
      args: ["gateway/packaging/publish.ps1"],
      /** Packaging is PowerShell + .NET publish for Windows targets. */
      requiresWindows: true,
    },
    artifactDirectory: "gateway/artifacts/dist",
    artifactPattern: /^DijiPeople\.IntegrationGateway-(.+)-win-x64\.zip$/,
    metadataFile: "gateway/artifacts/dist/release-metadata.json",
    versionSource: {
      file: "gateway/src/DijiPeople.Gateway.Host/DijiPeople.Gateway.Host.csproj",
      kind: "msbuild-version",
    },
  },
  {
    alias: "agent-desktop",
    appKey: "AGENT_DESKTOP",
    label: "DijiPeople Desktop Agent",
    platform: "WINDOWS",
    architecture: "X64",
    /**
     * No packaging command yet. The Electron agent is built by its own
     * workspace and has no repository-level package step, so publishing it
     * requires `--artifact`. Declared rather than omitted so `--app
     * agent-desktop` gives a precise message instead of "unknown app".
     */
    packageCommand: null,
    artifactDirectory: null,
    artifactPattern: null,
    metadataFile: null,
    versionSource: {
      file: "apps/agent-desktop/package.json",
      kind: "package-json",
    },
  },
  {
    alias: "zkteco-diagnostic",
    appKey: "ZKTECO_DIAGNOSTIC",
    label: "ZKTeco Diagnostic Utility",
    platform: "WINDOWS",
    architecture: "X86",
    packageCommand: null,
    artifactDirectory: null,
    artifactPattern: null,
    metadataFile: null,
    versionSource: {
      file: "tools/zkteco-poc/worker/DijiPeople.ZkTeco.Worker.csproj",
      kind: "msbuild-version",
    },
  },
];

export function resolveReleaseApp(value) {
  if (!value) return undefined;
  const needle = String(value).trim().toLowerCase().replace(/_/g, "-");
  return RELEASE_APPS.find(
    (app) =>
      app.alias === needle ||
      app.appKey.toLowerCase().replace(/_/g, "-") === needle,
  );
}

export function normalizeChannel(value) {
  const upper = String(value ?? "").trim().toUpperCase();
  return RELEASE_CHANNELS.includes(upper) ? upper : undefined;
}

/**
 * Normalises an environment name.
 *
 * Accepts the same aliases `packages/config/platform-domains.js` accepts, so
 * the CLI and the API cannot disagree about whether "prod" is production.
 */
export function normalizeEnvironment(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "staging" || raw === "stage" || raw === "uat") return "staging";
  if (raw === "development" || raw === "dev" || raw === "local") {
    return "development";
  }
  return undefined;
}

export const VERSION_PATTERN = /^\d+\.\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$/;

export function isValidVersion(value) {
  return VERSION_PATTERN.test(String(value ?? "").trim());
}

/** `<Version>2.0.0</Version>` from an MSBuild project file. */
export function parseMsBuildVersion(contents) {
  const match = /<Version>\s*([^<\s]+)\s*<\/Version>/i.exec(String(contents));
  return match ? match[1] : undefined;
}

export function parsePackageJsonVersion(contents) {
  try {
    const parsed = JSON.parse(String(contents));
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

/** Version embedded in a packaged artefact's file name, if the app names one. */
export function versionFromArtifactName(app, fileName) {
  if (!app?.artifactPattern || !fileName) return undefined;
  const match = app.artifactPattern.exec(fileName);
  return match ? match[1] : undefined;
}

/**
 * Reconciles every place a version is written down.
 *
 * A build whose assembly says 2.0.0, whose zip says 2.0.1 and whose metadata
 * says 2.0.0 will publish something, and whatever it publishes will be wrong.
 * Rather than picking a winner, this fails and names the disagreement — the
 * developer knows which file they meant to bump.
 *
 * `sources` is `{ label: version | undefined }`; undefined entries are simply
 * absent (an app with no metadata document is not a conflict).
 */
export function reconcileVersions(sources) {
  const present = Object.entries(sources).filter(
    ([, version]) => typeof version === "string" && version.trim().length > 0,
  );

  if (present.length === 0) {
    return {
      ok: false,
      version: undefined,
      error:
        "No version could be determined. Pass --version, or make the canonical version source readable.",
    };
  }

  const normalized = present.map(([label, version]) => [
    label,
    // 2.0.0 and 2.0.0.0 are the same release: .NET writes a four-part assembly
    // version from a three-part product version, and treating them as different
    // would fail every gateway build.
    String(version).trim().replace(/^(\d+\.\d+\.\d+)\.0$/, "$1"),
  ]);

  const distinct = [...new Set(normalized.map(([, version]) => version))];

  if (distinct.length > 1) {
    const detail = normalized
      .map(([label, version]) => `  ${label}: ${version}`)
      .join("\n");
    return {
      ok: false,
      version: undefined,
      error: `Conflicting versions detected. Every source must agree before a release can be published:\n${detail}`,
    };
  }

  const [version] = distinct;
  if (!isValidVersion(version)) {
    return {
      ok: false,
      version: undefined,
      error: `"${version}" is not a valid release version. Use MAJOR.MINOR.PATCH.`,
    };
  }

  return { ok: true, version, error: undefined };
}

/**
 * Minimal `--flag value` / `--flag=value` / `--boolean` parser.
 *
 * Written rather than taken from a dependency because the repository already
 * hand-parses argv in `scripts/` and adding a CLI framework for one script is
 * not justified. Unknown flags are returned rather than ignored so the caller
 * can reject a typo instead of silently publishing with a default.
 */
export function parseCliArgs(argv, { booleanFlags = [] } = {}) {
  const values = {};
  const positionals = [];
  const unknown = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutDashes = token.slice(2);
    const equalsAt = withoutDashes.indexOf("=");

    if (equalsAt !== -1) {
      values[withoutDashes.slice(0, equalsAt)] = withoutDashes.slice(
        equalsAt + 1,
      );
      continue;
    }

    if (booleanFlags.includes(withoutDashes)) {
      values[withoutDashes] = true;
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      // A value flag with nothing after it. Recorded as unknown so the caller
      // reports it instead of treating the missing value as `true`.
      unknown.push(token);
      continue;
    }

    values[withoutDashes] = next;
    index += 1;
  }

  return { values, positionals, unknown };
}

/**
 * Decides whether a publish may proceed without an interactive confirmation.
 *
 * Production is the case this exists for: a developer whose shell has a
 * production `.env` sourced would otherwise publish to production by typing the
 * command they always type. Development and staging need no ceremony.
 */
export function requiresExplicitConfirmation({
  environment,
  channel,
  assumeYes,
  interactive,
}) {
  const highRisk = environment === "production" || channel === "STABLE";
  if (!highRisk) return { required: false, reason: undefined };
  if (assumeYes) return { required: false, reason: undefined };
  if (!interactive) {
    return {
      required: true,
      reason:
        "This publish targets production or the STABLE channel and there is no terminal to confirm on. Re-run with --yes if this is deliberate (CI should always pass --yes explicitly).",
    };
  }
  return { required: true, reason: "interactive-confirmation" };
}
