/*
 * Test runner for apps/web.
 *
 * This app had no test coverage at all, which is why a great deal of its logic
 * was only ever checked by `tsc`. Typecheck does not catch a fallback that can
 * never be reached, a merge that drops a property, or a rule that quietly
 * matches nobody — all of which have happened here.
 *
 * Scoped deliberately to pure logic: resolvers, merges, catalogs. Rendering
 * tests would need jsdom and a testing library, which are not installed; the
 * functions below are where the defects actually live, and they need neither.
 */
module.exports = {
  displayName: "web",
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
