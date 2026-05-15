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

const emailInput =
  document.querySelector<HTMLInputElement>("#email");

const passwordInput =
  document.querySelector<HTMLInputElement>("#password");

const submitButton =
  document.querySelector<HTMLButtonElement>("#submit");

const errorBanner =
  document.querySelector<HTMLDivElement>("#error-banner");

const emailError =
  document.querySelector<HTMLDivElement>("#email-error");

const passwordError =
  document.querySelector<HTMLDivElement>("#password-error");

const statusText =
  document.querySelector<HTMLDivElement>("#status");

const togglePasswordButton =
  document.querySelector<HTMLButtonElement>("#toggle-password");

let isSubmitting = false;

initialize();

function initialize(): void {
  console.log("[DijiPeople Agent] renderer initialized");

  if (
    !form ||
    !emailInput ||
    !passwordInput ||
    !submitButton
  ) {
    showFatalError(
      "Login UI failed to initialize. Restart the agent.",
    );

    return;
  }

  hydrateRememberedEmail();

  form.addEventListener("submit", handleSubmit);

  togglePasswordButton?.addEventListener(
    "click",
    togglePasswordVisibility,
  );

  passwordInput.addEventListener(
    "keyup",
    handleCapsLockDetection,
  );

  emailInput.addEventListener(
    "keydown",
    clearTransientState,
  );

  passwordInput.addEventListener(
    "keydown",
    clearTransientState,
  );

  window.addEventListener("online", () => {
    setStatus("Connection restored.", "success");
  });

  window.addEventListener("offline", () => {
    setStatus(
      "You are offline. Internet connection is required.",
      "error",
    );
  });

  dijiWindow.dijiAgent?.onLoginError?.((result) => {
    if (isLoginFailure(result)) {
      renderFailure(result);
    }
  });

  emailInput.focus();

  setStatus(
    navigator.onLine
      ? "Ready to authenticate."
      : "Offline mode detected.",
    navigator.onLine ? "info" : "error",
  );
}

async function handleSubmit(
  event: SubmitEvent,
): Promise<void> {
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
        "Desktop bridge unavailable. Restart the application.",
    });

    return;
  }

  setSubmitting(true);

  try {
    setStatus(
      "Connecting to DijiPeople cloud...",
      "info",
    );

    await wait(500);

    setStatus(
      "Verifying credentials...",
      "info",
    );

    await wait(400);

    const result =
      await dijiWindow.dijiAgent.login(payload);

    if (isLoginFailure(result)) {
      renderFailure(result);
      focusFirstInvalidField(result);
      return;
    }

    rememberEmail(payload.email);

    setStatus(
      "Authentication successful. Starting secure session...",
      "success",
    );

    if (submitButton) {
      submitButton.textContent =
        "Launching Workspace...";
    }
  } catch (error) {
    console.error(
      "[DijiPeople Agent] Login failed:",
      error,
    );

    renderFailure({
      ok: false,
      code: "UNKNOWN_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unable to sign in.",
    });
  } finally {
    setSubmitting(false);
  }
}

function validatePayload(
  payload: LoginPayload,
): LoginResult {
  const fieldErrors:
    Partial<Record<keyof LoginPayload, string>> = {};

  if (!payload.email) {
    fieldErrors.email =
      "Work email is required.";
  } else if (!isValidEmail(payload.email)) {
    fieldErrors.email =
      "Enter a valid email address.";
  }

  if (!payload.password) {
    fieldErrors.password =
      "Password is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message:
        "Please review the highlighted fields.",
      fieldErrors,
    };
  }

  return { ok: true };
}

function renderFailure(
  result: LoginFailure,
): void {
  setStatus("", "info");

  if (errorBanner) {
    errorBanner.textContent =
      result.message || "Unable to sign in.";

    errorBanner.classList.add("visible");
  }

  const fieldErrors =
    result.fieldErrors ?? {};

  if (
    fieldErrors.email &&
    emailInput &&
    emailError
  ) {
    setFieldError(
      emailInput,
      emailError,
      fieldErrors.email,
    );
  }

  if (
    fieldErrors.password &&
    passwordInput &&
    passwordError
  ) {
    setFieldError(
      passwordInput,
      passwordError,
      fieldErrors.password,
    );
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
      "Incorrect password.",
    );
  }

  setStatus(
    mapErrorCodeToStatus(result.code),
    "error",
  );
}

function mapErrorCodeToStatus(
  code: LoginErrorCode,
): string {
  switch (code) {
    case "NETWORK_ERROR":
      return "Unable to connect to server.";

    case "ACCOUNT_INACTIVE":
      return "Your account is inactive.";

    case "INVALID_CREDENTIALS":
      return "Authentication failed.";

    default:
      return "Sign-in failed.";
  }
}

function setFieldError(
  input: HTMLInputElement,
  element: HTMLDivElement,
  message: string,
): void {
  input.setAttribute(
    "aria-invalid",
    "true",
  );

  element.textContent = message;
}

function clearErrors(): void {
  if (errorBanner) {
    errorBanner.textContent = "";

    errorBanner.classList.remove(
      "visible",
    );
  }

  if (emailError) {
    emailError.textContent = "";
  }

  if (passwordError) {
    passwordError.textContent = "";
  }

  emailInput?.removeAttribute(
    "aria-invalid",
  );

  passwordInput?.removeAttribute(
    "aria-invalid",
  );
}

function focusFirstInvalidField(
  result: LoginFailure,
): void {
  const fieldErrors =
    result.fieldErrors ?? {};

  if (fieldErrors.email) {
    emailInput?.focus();
    return;
  }

  if (
    fieldErrors.password ||
    result.code ===
    "INVALID_CREDENTIALS"
  ) {
    passwordInput?.focus();
  }
}

function setSubmitting(
  value: boolean,
): void {
  isSubmitting = value;

  if (submitButton) {
    submitButton.disabled = value;

    submitButton.textContent = value
      ? "Signing in..."
      : "Sign in to Agent";
  }

  if (emailInput) {
    emailInput.disabled = value;
  }

  if (passwordInput) {
    passwordInput.disabled = value;
  }

  if (togglePasswordButton) {
    togglePasswordButton.disabled = value;
  }
}

function setStatus(
  message: string,
  type: "info" | "success" | "error",
): void {
  if (!statusText) return;

  statusText.textContent = message;

  switch (type) {
    case "success":
      statusText.style.color =
        "#4ade80";
      break;

    case "error":
      statusText.style.color =
        "#f87171";
      break;

    default:
      statusText.style.color =
        "#94a3b8";
  }
}

function togglePasswordVisibility(): void {
  if (
    !passwordInput ||
    !togglePasswordButton
  ) {
    return;
  }

  const hidden =
    passwordInput.type ===
    "password";

  passwordInput.type = hidden
    ? "text"
    : "password";

  togglePasswordButton.textContent =
    hidden ? "Hide" : "Show";

  togglePasswordButton.setAttribute(
    "aria-label",
    hidden
      ? "Hide password"
      : "Show password",
  );
}

function handleCapsLockDetection(
  event: KeyboardEvent,
): void {
  if (!passwordError) return;

  const capsLockOn =
    event.getModifierState &&
    event.getModifierState("CapsLock");

  passwordError.textContent =
    capsLockOn
      ? "Caps Lock is ON."
      : "";
}

function clearTransientState(): void {
  if (
    errorBanner?.classList.contains(
      "visible",
    )
  ) {
    errorBanner.classList.remove(
      "visible",
    );
  }
}

function showFatalError(
  message: string,
): void {
  if (errorBanner) {
    errorBanner.textContent = message;

    errorBanner.classList.add(
      "visible",
    );
  }

  console.error(message);
}

function rememberEmail(
  email: string,
): void {
  try {
    localStorage.setItem(
      "diji-agent-email",
      email,
    );
  } catch {
    //
  }
}

function hydrateRememberedEmail(): void {
  try {
    const remembered =
      localStorage.getItem(
        "diji-agent-email",
      );

    if (
      remembered &&
      emailInput
    ) {
      emailInput.value = remembered;
    }
  } catch {
    //
  }
}

function wait(
  ms: number,
): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}

function isLoginFailure(
  result: LoginResult,
): result is LoginFailure {
  return result.ok === false;
}

function isValidEmail(
  value: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}