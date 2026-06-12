export function debugRuntime(message: string, data?: unknown) {
  if (process.env.NODE_ENV !== "development") return;

  console.debug(`[ModuleRuntime] ${message}`, data);
}
