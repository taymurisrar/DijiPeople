const locationWindow = window;
const shareButton = getButton("share-button");
const declineButton = getButton("decline-button");
const summary = getElement("request-summary");
const message = getElement("message");
const actions = getElement("location-actions");
const MAX_ACCEPTED_ACCURACY_METERS = 100;
const GEOLOCATION_ATTEMPT_TIMEOUT_MS = 20000;
const LOCATION_RETRY_DELAY_MS = 5000;
let currentRequest = null;
shareButton.addEventListener("click", () => {
    void shareLocation();
});
declineButton.addEventListener("click", () => {
    void submitResult({
        status: "DENIED",
        errorMessage: "Employee declined the location request.",
    });
});
void initialize();
async function initialize() {
    currentRequest =
        (await locationWindow.dijiAgent?.getLocationRequest?.()) ?? null;
    if (!currentRequest) {
        setDisabled(true);
        summary.textContent = "No active location request was found.";
        return;
    }
    summary.textContent = `Requested ${formatDateTime(currentRequest.requestedAt)}. This request expires ${formatDateTime(currentRequest.expiresAt)}.`;
    await handlePermissionState();
}
async function shareLocation() {
    if (!currentRequest)
        return;
    if (!navigator.geolocation) {
        await submitResult({
            status: "FAILED",
            errorMessage: "Location services are not available on this device.",
        });
        return;
    }
    setDisabled(true);
    setMessage("Capturing precise location...", "info");
    const result = await capturePreciseLocationUntilExpiry();
    if (result.ok === true) {
        await submitResult({
            status: "CAPTURED",
            latitude: result.latitude,
            longitude: result.longitude,
            accuracyMeters: result.accuracyMeters,
            capturedAt: result.capturedAt,
        });
        return;
    }
    await submitResult({
        status: result.status,
        errorMessage: result.message,
    });
}
async function capturePreciseLocationUntilExpiry() {
    let lastError = "Unable to capture precise location.";
    while (!isLocationRequestExpired()) {
        try {
            const position = await captureBrowserLocation();
            const accuracyMeters = Number(position.coords.accuracy);
            if (Number.isFinite(accuracyMeters) &&
                accuracyMeters <= MAX_ACCEPTED_ACCURACY_METERS) {
                return {
                    ok: true,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracyMeters,
                    capturedAt: new Date(position.timestamp).toISOString(),
                };
            }
            lastError = `Location accuracy is ${formatMeters(accuracyMeters)}. Waiting for accuracy under ${MAX_ACCEPTED_ACCURACY_METERS} m.`;
            setMessage(lastError, "info");
        }
        catch (error) {
            const status = readLocationErrorStatus(error);
            const errorMessage = readLocationErrorMessage(error);
            if (status === "DENIED") {
                return { ok: false, status, message: errorMessage };
            }
            const fallback = await captureLocationFallback(errorMessage);
            if (fallback.ok) {
                const accuracyMeters = Number(fallback.accuracyMeters);
                if (fallback.source !== "ip-location" &&
                    Number.isFinite(accuracyMeters) &&
                    accuracyMeters <= MAX_ACCEPTED_ACCURACY_METERS) {
                    return {
                        ok: true,
                        latitude: fallback.latitude,
                        longitude: fallback.longitude,
                        accuracyMeters,
                        capturedAt: fallback.capturedAt,
                    };
                }
                lastError = `Fallback location accuracy is ${formatMeters(accuracyMeters)}. Waiting for accuracy under ${MAX_ACCEPTED_ACCURACY_METERS} m.`;
                setMessage(lastError, "info");
            }
            else {
                lastError =
                    "message" in fallback ? fallback.message : "Unable to capture location.";
                setMessage(lastError, "info");
            }
        }
        await delay(LOCATION_RETRY_DELAY_MS);
    }
    return {
        ok: false,
        status: "FAILED",
        message: compactLocationError(`${lastError} The request expired before a precise location was captured.`) ?? "The request expired before a precise location was captured.",
    };
}
function captureBrowserLocation() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: GEOLOCATION_ATTEMPT_TIMEOUT_MS,
        });
    });
}
async function captureLocationFallback(primaryError) {
    setMessage("Device location failed. Trying Windows Location Services...", "info");
    const fallback = await locationWindow.dijiAgent?.captureDesktopLocation?.();
    if (!fallback) {
        return {
            ok: false,
            message: primaryError,
        };
    }
    return "message" in fallback
        ? {
            ok: false,
            message: compactLocationError(`${primaryError} ${fallback.message}`) ??
                "Unable to capture location.",
        }
        : fallback;
}
async function submitResult(result) {
    if (!currentRequest)
        return;
    setDisabled(true);
    setMessage("Sending response...", "info");
    const response = await locationWindow.dijiAgent?.submitLocationResult?.({
        ...result,
        errorMessage: compactLocationError(result.errorMessage),
        requestId: currentRequest.id,
        deviceId: currentRequest.deviceId,
    });
    if (response?.ok) {
        setMessage(result.status === "CAPTURED" ? "Location shared." : "Response sent.", "success");
        return;
    }
    setMessage(response && response.ok === false
        ? response.message
        : "Unable to send response.", "error");
    setDisabled(false);
}
async function handlePermissionState() {
    const permission = await readGeolocationPermission();
    if (permission === "granted") {
        actions.classList.add("hidden");
        setMessage("Location permission is already granted. Capturing now.", "info");
        await shareLocation();
        return;
    }
    actions.classList.remove("hidden");
    if (permission === "denied") {
        setMessage("Location is blocked on this device. Enable location permission, then try again.", "error");
        return;
    }
    setMessage("Choose Share to approve this one-time request.", "info");
}
async function readGeolocationPermission() {
    if (!navigator.permissions?.query)
        return "unknown";
    try {
        const status = await navigator.permissions.query({
            name: "geolocation",
        });
        return status.state;
    }
    catch {
        return "unknown";
    }
}
function readLocationErrorStatus(error) {
    if (isGeolocationError(error) && error.code === 1) {
        return "DENIED";
    }
    return "FAILED";
}
function readLocationErrorMessage(error) {
    if (isGeolocationError(error)) {
        return error.message || "Unable to capture current location.";
    }
    return error instanceof Error
        ? error.message
        : "Unable to capture current location.";
}
function compactLocationError(value) {
    const message = value?.replace(/\s+/g, " ").trim();
    if (!message)
        return undefined;
    if (message.length <= 480)
        return message;
    return `${message.slice(0, 477)}...`;
}
function isLocationRequestExpired() {
    if (!currentRequest)
        return true;
    const expiresAt = new Date(currentRequest.expiresAt).getTime();
    if (!Number.isFinite(expiresAt))
        return true;
    return Date.now() >= expiresAt;
}
function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
function formatMeters(value) {
    return Number.isFinite(value) ? `${Math.round(value)} m` : "unknown";
}
function isGeolocationError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "number");
}
function setDisabled(disabled) {
    shareButton.disabled = disabled;
    declineButton.disabled = disabled;
}
function setMessage(text, tone) {
    message.textContent = text;
    message.className = tone;
}
function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return "not set";
    return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}
function getButton(id) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLButtonElement)) {
        throw new Error(`Missing button: ${id}`);
    }
    return element;
}
function getElement(id) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing element: ${id}`);
    }
    return element;
}
export {};
