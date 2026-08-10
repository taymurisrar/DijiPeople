/*
 * Test runner for apps/admin.
 *
 * Added because role handling here is enforced by string comparisons that
 * nothing type-checks: `role !== "SUPER_ADMIN"` compiles perfectly and silently
 * locks out PLATFORM_OWNER, which is what happened across five call sites.
 *
 * Scoped to pure logic — RBAC helpers and the module registry. Rendering tests
 * would need jsdom, which is not installed; the defects here are in the rules,
 * not the markup.
 */
module.exports = {
  displayName: "admin",
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
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
};
