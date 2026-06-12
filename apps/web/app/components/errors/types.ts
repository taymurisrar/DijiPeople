import type { StandardApiError } from "@/lib/api-error";

export type ErrorModalAction = "close" | "go-back" | "dashboard" | "retry" | "sign-in";

export type DisplayableError = StandardApiError & {
  retry?: () => void;
};

export type ErrorContextValue = {
  error: DisplayableError | null;
  showError: (error: unknown, retry?: () => void) => void;
  clearError: () => void;
};
