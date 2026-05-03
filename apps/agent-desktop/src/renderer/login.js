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
            message: "Desktop agent bridge is unavailable. Please restart the application.",
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
    }
    catch (error) {
        console.error("[DijiPeople Agent] Login failed:", error);
        renderFailure({
            ok: false,
            code: "UNKNOWN_ERROR",
            message: error instanceof Error
                ? error.message
                : "Unable to sign in. Please try again.",
        });
    }
    finally {
        setSubmitting(false);
    }
}
function validatePayload(payload) {
    const fieldErrors = {};
    if (!payload.email) {
        fieldErrors.email = "Work email is required.";
    }
    else if (!isValidEmail(payload.email)) {
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
function renderFailure(result) {
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
    if (result.code === "INVALID_CREDENTIALS" &&
        !fieldErrors.password &&
        passwordInput &&
        passwordError) {
        setFieldError(passwordInput, passwordError, "Check your password and try again.");
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
    if (emailError)
        emailError.textContent = "";
    if (passwordError)
        passwordError.textContent = "";
    emailInput?.removeAttribute("aria-invalid");
    passwordInput?.removeAttribute("aria-invalid");
    setStatus("");
}
function focusFirstInvalidField(result) {
    const fieldErrors = result.fieldErrors ?? {};
    if (fieldErrors.email) {
        emailInput?.focus();
        return;
    }
    if (fieldErrors.password || result.code === "INVALID_CREDENTIALS") {
        passwordInput?.focus();
    }
}
function setSubmitting(value) {
    isSubmitting = value;
    if (submitButton) {
        submitButton.disabled = value;
        submitButton.textContent = value ? "Signing in..." : "Sign in";
    }
    if (emailInput)
        emailInput.disabled = value;
    if (passwordInput)
        passwordInput.disabled = value;
    if (togglePasswordButton)
        togglePasswordButton.disabled = value;
    setStatus(value ? "Verifying your credentials..." : "");
}
function setStatus(message) {
    if (statusText) {
        statusText.textContent = message;
    }
}
function togglePasswordVisibility() {
    if (!passwordInput || !togglePasswordButton)
        return;
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    togglePasswordButton.textContent = isHidden ? "Hide" : "Show";
    togglePasswordButton.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
}
function showFatalError(message) {
    if (errorBanner) {
        errorBanner.textContent = message;
        errorBanner.classList.add("visible");
    }
    else {
        console.error(message);
    }
}
function isLoginFailure(result) {
    return result.ok === false;
}
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
