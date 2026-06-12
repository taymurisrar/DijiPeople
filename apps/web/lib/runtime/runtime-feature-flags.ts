export const runtimeFeatureFlags = {
  enableEmployeeRuntime:
    process.env.NEXT_PUBLIC_ENABLE_EMPLOYEE_RUNTIME === "true",
} as const;
