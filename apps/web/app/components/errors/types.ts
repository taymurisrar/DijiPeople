import type { StandardApiError } from "@/lib/api-error";

export type ErrorModalAction = "close" | "go-back" | "dashboard" | "retry" | "sign-in";

export type DisplayableError = StandardApiError & {
  /** Set by a boundary that knows its report is not a fault of its own (BUG-4440). */
  severity?: "WARNING" | "ERROR";
  retry?: () => void;
};

export type ErrorContextValue = {
  error: DisplayableError | null;
  showError: (error: unknown, retry?: () => void) => void;
  clearError: () => void;
};
