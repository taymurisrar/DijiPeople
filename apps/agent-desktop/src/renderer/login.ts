type LoginPayload = {
  email: string;
  password: string;
};

type LoginErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_INACTIVE"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "UNKNOWN_ERROR";

type LoginResult =
  | { ok: true }
  | {
      ok: false;
      code: LoginErrorCode;
      message: string;
      fieldErrors?: Partial<Record<keyof LoginPayload, string>>;
    };

type LoginFailure = Extract<LoginResult, { ok: false }>;

type DijiAgentBridge = {
  login: (payload: LoginPayload) => Promise<LoginResult>;
  onLoginError?: (callback: (result: LoginResult) => void) => () => void;
};

const dijiWindow = window as Window & {
  dijiAgent?: DijiAgentBridge;
};

const form = document.querySelector<HTMLFormElement>("#login-form");
const emailInput = document.querySelector<HTMLInputElement>("#email");
const passwordInput = document.querySelector<HTMLInputElement>("#password");
const submitButton = document.querySelector<HTMLButtonElement>("#submit");
const errorBanner = document.querySelector<HTMLDivElement>("#error-banner");
const emailError = document.querySelector<HTMLDivElement>("#email-error");
const passwordError = document.querySelector<HTMLDivElement>("#password-error");
const statusText = document.querySelector<HTMLDivElement>("#status");
const togglePasswordButton =
  document.querySelector<HTMLButtonElement>("#toggle-password");

let isSubmitting = false;

initialize();

function initialize(): void {
  console.log("[DijiPeople Agent] login.js loaded");

  if (!form || !emailInput || !passwordInput || !submitButton) {
    showFatalError("Login form failed to initialize. Please restart the agent.");
    return;
  }

  console.log("[DijiPeople Agent] bridge:", dijiWindow.dijiAgent);

  form.addEventListener("submit", handleSubmit);

  togglePasswordButton?.addEventListener("click", togglePasswordVisibility);

  dijiWindow.dijiAgent?.onLoginError?.((result) => {
    if (isLoginFailure(result)) {
      renderFailure(result);
    }
  });

  emailInput.focus();
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (isSubmitting) return;

  clearErrors();

  const payload: LoginPayload = {
    email: emailInput?.value.trim().toLowerCase() ?? "",
    password: passwordInput?.value ?? "",
  };

  const validation = validatePayload(payload);

  if (isLoginFailure(validation)) {
    renderFailure(validation);
    focusFirstInvalidField(validation);
    return;
  }

  if (!dijiWindow.dijiAgent?.login) {
    renderFailure({
      ok: false,
      code: "UNKNOWN_ERROR",
      message:
        "Desktop agent bridge is unavailable. Please restart the application.",
    });
    return;
  }

  setSubmitting(true);

  try {
    const result = await dijiWindow.dijiAgent.login(payload);

    if (isLoginFailure(result)) {
      renderFailure(result);
      focusFirstInvalidField(result);
      return;
    }

    setStatus("Signed in successfully. Starting your session...");
  } catch (error) {
    console.error("[DijiPeople Agent] Login failed:", error);

    renderFailure({
      ok: false,
      code: "UNKNOWN_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unable to sign in. Please try again.",
    });
  } finally {
    setSubmitting(false);
  }
}

function validatePayload(payload: LoginPayload): LoginResult {
  const fieldErrors: Partial<Record<keyof LoginPayload, string>> = {};

  if (!payload.email) {
    fieldErrors.email = "Work email is required.";
  } else if (!isValidEmail(payload.email)) {
    fieldErrors.email = "Enter a valid work email address.";
  }

  if (!payload.password) {
    fieldErrors.password = "Password is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  return { ok: true };
}

function renderFailure(result: LoginFailure): void {
  setStatus("");

  if (errorBanner) {
    errorBanner.textContent = result.message || "Unable to sign in.";
    errorBanner.classList.add("visible");
  }

  const fieldErrors = result.fieldErrors ?? {};

  if (fieldErrors.email && emailInput && emailError) {
    setFieldError(emailInput, emailError, fieldErrors.email);
  }

  if (fieldErrors.password && passwordInput && passwordError) {
    setFieldError(passwordInput, passwordError, fieldErrors.password);
  }

  if (
    result.code === "INVALID_CREDENTIALS" &&
    !fieldErrors.password &&
    passwordInput &&
    passwordError
  ) {
    setFieldError(
      passwordInput,
      passwordError,
      "Check your password and try again.",
    );
  }
}

function setFieldError(
  input: HTMLInputElement,
  element: HTMLDivElement,
  message: string,
): void {
  input.setAttribute("aria-invalid", "true");
  element.textContent = message;
}

function clearErrors(): void {
  if (errorBanner) {
    errorBanner.textContent = "";
    errorBanner.classList.remove("visible");
  }

  if (emailError) emailError.textContent = "";
  if (passwordError) passwordError.textContent = "";

  emailInput?.removeAttribute("aria-invalid");
  passwordInput?.removeAttribute("aria-invalid");

  setStatus("");
}

function focusFirstInvalidField(result: LoginFailure): void {
  const fieldErrors = result.fieldErrors ?? {};

  if (fieldErrors.email) {
    emailInput?.focus();
    return;
  }

  if (fieldErrors.password || result.code === "INVALID_CREDENTIALS") {
    passwordInput?.focus();
  }
}

function setSubmitting(value: boolean): void {
  isSubmitting = value;

  if (submitButton) {
    submitButton.disabled = value;
    submitButton.textContent = value ? "Signing in..." : "Sign in";
  }

  if (emailInput) emailInput.disabled = value;
  if (passwordInput) passwordInput.disabled = value;
  if (togglePasswordButton) togglePasswordButton.disabled = value;

  setStatus(value ? "Verifying your credentials..." : "");
}

function setStatus(message: string): void {
  if (statusText) {
    statusText.textContent = message;
  }
}

function togglePasswordVisibility(): void {
  if (!passwordInput || !togglePasswordButton) return;

  const isHidden = passwordInput.type === "password";

  passwordInput.type = isHidden ? "text" : "password";
  togglePasswordButton.textContent = isHidden ? "Hide" : "Show";
  togglePasswordButton.setAttribute(
    "aria-label",
    isHidden ? "Hide password" : "Show password",
  );
}

function showFatalError(message: string): void {
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.classList.add("visible");
  } else {
    console.error(message);
  }
}

function isLoginFailure(result: LoginResult): result is LoginFailure {
  return result.ok === false;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}