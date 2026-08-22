/*
 * Test runner for apps/agent-desktop.
 *
 * This workspace had no runner at all — no config, no test script, not a single
 * spec — and `tsc --noEmit` was its only automated signal. It is also the app
 * with native OS capabilities the employee cannot observe: it reads active
 * window titles, captures geolocation, holds a refresh token in the OS
 * credential vault, and runs unattended from login. Its most dangerous code was
 * the code no test touched. ITEM-0033.
 *
 * Scoped to the modules with no Electron dependency of their own, which is where
 * the expensive defects live and where no harness beyond ts-jest is needed. The
 * `electron` module is stubbed (see test/electron-stub.ts) because
 * `offline-queue` reaches it only for `app.getPath`, and refusing to test a file
 * over one line of Electron would leave the queue — the subject of BUG-0036 —
 * uncovered.
 *
 * `secure-store`, `tray` and `main` need a real Electron harness and are
 * deliberately out of scope rather than faked; a stub of the credential vault
 * would assert the stub.
 */
module.exports = {
  displayName: "agent-desktop",
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.spec.ts", "<rootDir>/test/**/*.spec.ts"],
  transform: {
    "^.+\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // The workspace's own tsconfig excludes specs and declares no jest
          // types, and adding them there would put test globals in the shipped
          // build's type surface. Declared here instead, where they belong.
          types: ["jest", "node"],
          esModuleInterop: true,
          module: "commonjs",
          target: "es2022",
          moduleResolution: "node",
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    "^electron$": "<rootDir>/test/electron-stub.ts",
    "^\.\./config/env$": "<rootDir>/test/env-stub.ts",
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
