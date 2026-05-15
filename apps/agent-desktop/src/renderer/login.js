const dijiWindow = window;
const form = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#submit");
const errorBanner = document.querySelector("#error-banner");
const emailError = document.querySelector("#email-error");
const passwordError = document.querySelector("#password-error");
const statusText = document.querySelector("#status");
const togglePasswordButton = document.querySelector("#toggle-password");
let isSubmitting = false;
initialize();
function initialize() {
    console.log("[DijiPeople Agent] renderer initialized");
    if (!form ||
        !emailInput ||
        !passwordInput ||
        !submitButton) {
        showFatalError("Login UI failed to initialize. Restart the agent.");
        return;
    }
    hydrateRememberedEmail();
    form.addEventListener("submit", handleSubmit);
    togglePasswordButton?.addEventListener("click", togglePasswordVisibility);
    passwordInput.addEventListener("keyup", handleCapsLockDetection);
    emailInput.addEventListener("keydown", clearTransientState);
    passwordInput.addEventListener("keydown", clearTransientState);
    window.addEventListener("online", () => {
        setStatus("Connection restored.", "success");
    });
    window.addEventListener("offline", () => {
        setStatus("You are offline. Internet connection is required.", "error");
    });
    dijiWindow.dijiAgent?.onLoginError?.((result) => {
        if (isLoginFailure(result)) {
            renderFailure(result);
        }
    });
    emailInput.focus();
    setStatus(navigator.onLine
        ? "Ready to authenticate."
        : "Offline mode detected.", navigator.onLine ? "info" : "error");
}
async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting)
        return;
    clearErrors();
    const payload = {
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
            message: "Desktop bridge unavailable. Restart the application.",
        });
        return;
    }
    setSubmitting(true);
    try {
        setStatus("Connecting to DijiPeople cloud...", "info");
        await wait(500);
        setStatus("Verifying credentials...", "info");
        await wait(400);
        const result = await dijiWindow.dijiAgent.login(payload);
        if (isLoginFailure(result)) {
            renderFailure(result);
            focusFirstInvalidField(result);
            return;
        }
        rememberEmail(payload.email);
        setStatus("Authentication successful. Starting secure session...", "success");
        if (submitButton) {
            submitButton.textContent =
                "Launching Workspace...";
        }
    }
    catch (error) {
        console.error("[DijiPeople Agent] Login failed:", error);
        renderFailure({
            ok: false,
            code: "UNKNOWN_ERROR",
            message: error instanceof Error
                ? error.message
                : "Unable to sign in.",
        });
    }
    finally {
        setSubmitting(false);
    }
}
function validatePayload(payload) {
    const fieldErrors = {};
    if (!payload.email) {
        fieldErrors.email =
            "Work email is required.";
    }
    else if (!isValidEmail(payload.email)) {
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
            message: "Please review the highlighted fields.",
            fieldErrors,
        };
    }
    return { ok: true };
}
function renderFailure(result) {
    setStatus("", "info");
    if (errorBanner) {
        errorBanner.textContent =
            result.message || "Unable to sign in.";
        errorBanner.classList.add("visible");
    }
    const fieldErrors = result.fieldErrors ?? {};
    if (fieldErrors.email &&
        emailInput &&
        emailError) {
        setFieldError(emailInput, emailError, fieldErrors.email);
    }
    if (fieldErrors.password &&
        passwordInput &&
        passwordError) {
        setFieldError(passwordInput, passwordError, fieldErrors.password);
    }
    if (result.code === "INVALID_CREDENTIALS" &&
        !fieldErrors.password &&
        passwordInput &&
        passwordError) {
        setFieldError(passwordInput, passwordError, "Incorrect password.");
    }
    setStatus(mapErrorCodeToStatus(result.code), "error");
}
function mapErrorCodeToStatus(code) {
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
function setFieldError(input, element, message) {
    input.setAttribute("aria-invalid", "true");
    element.textContent = message;
}
function clearErrors() {
    if (errorBanner) {
        errorBanner.textContent = "";
        errorBanner.classList.remove("visible");
    }
    if (emailError) {
        emailError.textContent = "";
    }
    if (passwordError) {
        passwordError.textContent = "";
    }
    emailInput?.removeAttribute("aria-invalid");
    passwordInput?.removeAttribute("aria-invalid");
}
function focusFirstInvalidField(result) {
    const fieldErrors = result.fieldErrors ?? {};
    if (fieldErrors.email) {
        emailInput?.focus();
        return;
    }
    if (fieldErrors.password ||
        result.code ===
            "INVALID_CREDENTIALS") {
        passwordInput?.focus();
    }
}
function setSubmitting(value) {
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
function setStatus(message, type) {
    if (!statusText)
        return;
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
function togglePasswordVisibility() {
    if (!passwordInput ||
        !togglePasswordButton) {
        return;
    }
    const hidden = passwordInput.type ===
        "password";
    passwordInput.type = hidden
        ? "text"
        : "password";
    togglePasswordButton.textContent =
        hidden ? "Hide" : "Show";
    togglePasswordButton.setAttribute("aria-label", hidden
        ? "Hide password"
        : "Show password");
}
function handleCapsLockDetection(event) {
    if (!passwordError)
        return;
    const capsLockOn = event.getModifierState &&
        event.getModifierState("CapsLock");
    passwordError.textContent =
        capsLockOn
            ? "Caps Lock is ON."
            : "";
}
function clearTransientState() {
    if (errorBanner?.classList.contains("visible")) {
        errorBanner.classList.remove("visible");
    }
}
function showFatalError(message) {
    if (errorBanner) {
        errorBanner.textContent = message;
        errorBanner.classList.add("visible");
    }
    console.error(message);
}
function rememberEmail(email) {
    try {
        localStorage.setItem("diji-agent-email", email);
    }
    catch {
        //
    }
}
function hydrateRememberedEmail() {
    try {
        const remembered = localStorage.getItem("diji-agent-email");
        if (remembered &&
            emailInput) {
            emailInput.value = remembered;
        }
    }
    catch {
        //
    }
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isLoginFailure(result) {
    return result.ok === false;
}
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
