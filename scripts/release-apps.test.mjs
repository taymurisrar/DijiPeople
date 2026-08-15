import assert from "node:assert/strict";
import test from "node:test";

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

/**
 * The decisions the release CLI makes BEFORE anything is uploaded.
 *
 * These are the ones that decide whether the right bytes go to the right place:
 * which app, which version when several files claim to know it, which channel,
 * and whether a production publish was actually asked for.
 */

test("resolves an app by alias and by app key", () => {
  assert.equal(resolveReleaseApp("integration-gateway").appKey, "INTEGRATION_GATEWAY");
  assert.equal(resolveReleaseApp("INTEGRATION_GATEWAY").alias, "integration-gateway");
  assert.equal(resolveReleaseApp("Integration-Gateway").alias, "integration-gateway");
  assert.equal(resolveReleaseApp("payroll"), undefined);
  assert.equal(resolveReleaseApp(""), undefined);
});

test("every catalogued app names one canonical version source", () => {
  for (const app of RELEASE_APPS) {
    assert.ok(app.versionSource?.file, `${app.alias} has no version source`);
    assert.ok(
      ["msbuild-version", "package-json"].includes(app.versionSource.kind),
      `${app.alias} has an unknown version source kind`,
    );
  }
});

test("normalizes only the channels ApplicationRelease defines", () => {
  assert.equal(normalizeChannel("beta"), "BETA");
  assert.equal(normalizeChannel("STABLE"), "STABLE");
  assert.equal(normalizeChannel("internal"), "INTERNAL");
  // No inventing channel values the schema does not have.
  assert.equal(normalizeChannel("canary"), undefined);
  assert.equal(normalizeChannel(""), undefined);
});

test("normalizes environments the same way the platform config does", () => {
  assert.equal(normalizeEnvironment("prod"), "production");
  assert.equal(normalizeEnvironment("PRODUCTION"), "production");
  assert.equal(normalizeEnvironment("uat"), "staging");
  assert.equal(normalizeEnvironment("local"), "development");
  assert.equal(normalizeEnvironment("qa"), undefined);
});

test("accepts three- and four-part versions, rejects decorated ones", () => {
  assert.ok(isValidVersion("2.0.0"));
  assert.ok(isValidVersion("2.0.0.0"));
  assert.ok(isValidVersion("2.1.0-rc.1"));
  assert.ok(!isValidVersion("v2.0.0"));
  assert.ok(!isValidVersion("2.0"));
  assert.ok(!isValidVersion("latest"));
});

test("reads the canonical version out of an MSBuild project", () => {
  assert.equal(
    parseMsBuildVersion("<Project><PropertyGroup><Version>2.0.0</Version></PropertyGroup></Project>"),
    "2.0.0",
  );
  assert.equal(parseMsBuildVersion("<Project/>"), undefined);
});

test("reads the canonical version out of a package.json", () => {
  assert.equal(parsePackageJsonVersion('{"version":"1.4.2"}'), "1.4.2");
  assert.equal(parsePackageJsonVersion("not json"), undefined);
});

test("extracts the version an artefact file name claims", () => {
  const gateway = resolveReleaseApp("integration-gateway");
  assert.equal(
    versionFromArtifactName(
      gateway,
      "DijiPeople.IntegrationGateway-2.0.0-win-x64.zip",
    ),
    "2.0.0",
  );
  assert.equal(versionFromArtifactName(gateway, "something-else.zip"), undefined);
});

test("reconciles agreeing versions, treating 2.0.0.0 as 2.0.0", () => {
  const result = reconcileVersions({
    csproj: "2.0.0",
    assembly: "2.0.0.0",
    metadata: "2.0.0",
    artifact: undefined,
  });

  assert.equal(result.ok, true);
  assert.equal(result.version, "2.0.0");
});

test("refuses to publish when two sources disagree about the version", () => {
  const result = reconcileVersions({
    "gateway.csproj": "2.0.0",
    "release-metadata.json": "2.0.1",
  });

  assert.equal(result.ok, false);
  // Naming both sides is the point: the developer knows which file to bump.
  assert.match(result.error, /2\.0\.0/);
  assert.match(result.error, /2\.0\.1/);
});

test("refuses when no version can be determined at all", () => {
  const result = reconcileVersions({ csproj: undefined, metadata: "" });
  assert.equal(result.ok, false);
  assert.match(result.error, /No version could be determined/);
});

test("refuses a version that agrees everywhere but is malformed", () => {
  const result = reconcileVersions({ csproj: "v2", metadata: "v2" });
  assert.equal(result.ok, false);
  assert.match(result.error, /not a valid release version/);
});

test("parses value flags, boolean flags and = forms", () => {
  const { values, unknown } = parseCliArgs(
    ["--app", "integration-gateway", "--channel=beta", "--dry-run"],
    { booleanFlags: ["dry-run"] },
  );

  assert.equal(values.app, "integration-gateway");
  assert.equal(values.channel, "beta");
  assert.equal(values["dry-run"], true);
  assert.deepEqual(unknown, []);
});

test("reports a value flag left without a value instead of defaulting it", () => {
  const { unknown } = parseCliArgs(["--channel", "--dry-run"], {
    booleanFlags: ["dry-run"],
  });

  // Silently treating `--channel` as true would publish to a default channel
  // the developer never chose.
  assert.deepEqual(unknown, ["--channel"]);
});

test("development and beta publish without ceremony", () => {
  const check = requiresExplicitConfirmation({
    environment: "development",
    channel: "BETA",
    assumeYes: false,
    interactive: true,
  });

  assert.equal(check.required, false);
});

test("production requires confirmation", () => {
  const check = requiresExplicitConfirmation({
    environment: "production",
    channel: "BETA",
    assumeYes: false,
    interactive: true,
  });

  assert.equal(check.required, true);
  assert.equal(check.reason, "interactive-confirmation");
});

test("STABLE requires confirmation even outside production", () => {
  const check = requiresExplicitConfirmation({
    environment: "staging",
    channel: "STABLE",
    assumeYes: false,
    interactive: true,
  });

  assert.equal(check.required, true);
});

test("a non-interactive production publish without --yes is refused", () => {
  const check = requiresExplicitConfirmation({
    environment: "production",
    channel: "STABLE",
    assumeYes: false,
    interactive: false,
  });

  assert.equal(check.required, true);
  assert.match(check.reason, /--yes/);
});

test("--yes satisfies the confirmation for automation", () => {
  const check = requiresExplicitConfirmation({
    environment: "production",
    channel: "STABLE",
    assumeYes: true,
    interactive: false,
  });

  assert.equal(check.required, false);
});
