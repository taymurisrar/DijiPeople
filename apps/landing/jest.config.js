/*
 * Test runner for apps/landing.
 *
 * This app had no test coverage. That mattered more than it looks: the landing
 * app is where BUG-0028 lived — a country-to-currency table compiled into the
 * shipped bundle — and where a "Popular" badge was decided by array position
 * rather than configuration. Neither is something `tsc` can see.
 *
 * Scoped to pure logic, matching apps/web: pricing display rules, CTA state
 * derivation, the comparison matrix. jsdom and a rendering library are not
 * installed, and the rules worth pinning here need neither — they are the ones
 * that decide what a customer is quoted and where a buy button leads.
 *
 * jest and ts-jest are hoisted at the repository root, so this adds no
 * dependency to the landing workspace.
 */
module.exports = {
  displayName: "landing",
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/*.spec.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
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
    "^@/(.*)$": "<rootDir>/$1",
  },
  /* Next's build output holds generated duplicates of app files. */
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
};
