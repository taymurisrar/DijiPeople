const locationWindow = window;
const shareButton = getButton("share-button");
const declineButton = getButton("decline-button");
const summary = getElement("request-summary");
const message = getElement("message");
const actions = getElement("location-actions");
// Must stay in sync with MAX_LOCATION_ACCURACY_METERS in
// services/api/src/modules/agent/agent.service.ts — the API rejects anything looser.
const MAX_ACCEPTED_ACCURACY_METERS = 2000;
const MAX_CAPTURE_ATTEMPTS = 4;
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
    actions.classList.remove("hidden");
    setMessage("Choose Share to approve this one-time request.", "info");
}
async function shareLocation() {
    if (!currentRequest)
        return;
    setDisabled(true);
    setMessage("Capturing your location...", "info");
    const result = await captureLocationUntilAccurate();
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
/**
 * Location comes from the desktop main process (Windows Location Services, then
 * an IP lookup) rather than navigator.geolocation, which cannot resolve a
 * position in Electron without a Google network-location API key.
 */
async function captureLocationUntilAccurate() {
    let lastError = "Unable to capture a location from this device.";
    for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt += 1) {
        if (isLocationRequestExpired()) {
            return {
                ok: false,
                status: "FAILED",
                message: compact(`${lastError} The request expired before a usable location was captured.`),
            };
        }
        const capture = await locationWindow.dijiAgent?.captureDesktopLocation?.();
        if (!capture) {
            return {
                ok: false,
                status: "FAILED",
                message: "The desktop agent bridge is unavailable.",
            };
        }
        if (capture.ok === true) {
            const accuracyMeters = Number(capture.accuracyMeters);
            if (Number.isFinite(accuracyMeters) &&
                accuracyMeters > 0 &&
                accuracyMeters <= MAX_ACCEPTED_ACCURACY_METERS) {
                return {
                    ok: true,
                    latitude: capture.latitude,
                    longitude: capture.longitude,
                    accuracyMeters,
                    capturedAt: capture.capturedAt,
                };
            }
            lastError = Number.isFinite(accuracyMeters)
                ? `The best available location is only accurate to ${formatMeters(accuracyMeters)}, which is looser than the ${formatMeters(MAX_ACCEPTED_ACCURACY_METERS)} limit.`
                : "Windows reported a position without an accuracy value, so it cannot be accepted.";
        }
        else if (capture.reason === "denied") {
            // A device-level block will not resolve itself by retrying.
            return { ok: false, status: "DENIED", message: compact(capture.message) };
        }
        else {
            lastError = capture.message;
        }
        if (attempt < MAX_CAPTURE_ATTEMPTS) {
            setMessage(`${lastError} Retrying...`, "info");
            await delay(LOCATION_RETRY_DELAY_MS);
        }
    }
    return { ok: false, status: "FAILED", message: compact(lastError) };
}
async function submitResult(result) {
    if (!currentRequest)
        return;
    setDisabled(true);
    setMessage("Sending response...", "info");
    const response = await locationWindow.dijiAgent?.submitLocationResult?.({
        ...result,
        errorMessage: result.errorMessage
            ? compact(result.errorMessage)
            : undefined,
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
function compact(value) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized)
        return "Unable to capture location.";
    if (normalized.length <= 480)
        return normalized;
    return `${normalized.slice(0, 477)}...`;
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
    return Number.isFinite(value) ? `${Math.round(value).toLocaleString()} m` : "unknown";
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
