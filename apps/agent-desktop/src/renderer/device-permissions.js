const permissionWindow = window;
const state = {
    cameraPermission: "UNKNOWN",
    microphonePermission: "UNKNOWN",
    locationPermission: "UNKNOWN",
};
let permissionConfig = {
    cameraAccess: false,
    microphoneAccess: false,
    locationAccess: false,
};
const cameraStatus = getElement("camera-status");
const microphoneStatus = getElement("microphone-status");
const locationStatus = getElement("location-status");
const message = getElement("message");
const cameraButton = getButton("camera-button");
const microphoneButton = getButton("microphone-button");
const locationButton = getButton("location-button");
cameraButton.addEventListener("click", () => {
    void requestMediaPermission("camera");
});
microphoneButton.addEventListener("click", () => {
    void requestMediaPermission("microphone");
});
locationButton.addEventListener("click", () => {
    void requestLocationPermission();
});
getButton("save-button").addEventListener("click", () => {
    void savePermissions();
});
void initialize();
async function initialize() {
    message.textContent = "Checking device permissions...";
    permissionConfig =
        (await permissionWindow.dijiAgent?.getDevicePermissionConfig?.()) ??
            permissionConfig;
    await refreshKnownPermissionStates();
    await requestEnabledPermissions();
    await savePermissions("Permission status saved.");
}
async function refreshKnownPermissionStates() {
    state.cameraPermission = permissionConfig.cameraAccess
        ? await queryPermission("camera")
        : "UNAVAILABLE";
    state.microphonePermission = permissionConfig.microphoneAccess
        ? await queryPermission("microphone")
        : "UNAVAILABLE";
    // Location is resolved by requestLocationPermission() through the desktop
    // bridge; navigator.permissions cannot see the Windows location setting.
    state.locationPermission = permissionConfig.locationAccess
        ? "UNKNOWN"
        : "UNAVAILABLE";
    render();
}
async function requestMediaPermission(kind) {
    if (!isPermissionEnabled(kind)) {
        setPermission(kind, "UNAVAILABLE");
        return;
    }
    const constraints = kind === "camera"
        ? { video: true, audio: false }
        : { video: false, audio: true };
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            setPermission(kind, "UNAVAILABLE");
            return;
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => track.stop());
        setPermission(kind, "GRANTED");
    }
    catch (error) {
        setPermission(kind, readPermissionError(error));
    }
}
async function requestLocationPermission() {
    if (!permissionConfig.locationAccess) {
        state.locationPermission = "UNAVAILABLE";
        render();
        return;
    }
    // The desktop bridge reports the Windows location consent state. A failed
    // position fix is not the same as a denied permission, so this no longer
    // downgrades the device just because no coordinates were available.
    locationStatus.textContent = "Checking...";
    state.locationPermission =
        (await permissionWindow.dijiAgent?.probeLocationPermission?.()) ?? "UNKNOWN";
    render();
}
async function requestEnabledPermissions() {
    if (permissionConfig.cameraAccess &&
        shouldRequestPermission(state.cameraPermission)) {
        await requestMediaPermission("camera");
    }
    if (permissionConfig.microphoneAccess &&
        shouldRequestPermission(state.microphonePermission)) {
        await requestMediaPermission("microphone");
    }
    if (permissionConfig.locationAccess &&
        shouldRequestPermission(state.locationPermission)) {
        await requestLocationPermission();
    }
}
async function savePermissions(successMessage = "Permission status saved.") {
    message.textContent = "Saving...";
    const result = await permissionWindow.dijiAgent?.updateDevicePermissions?.(state);
    if (!result) {
        message.textContent = "Desktop bridge is unavailable.";
        return;
    }
    if (result.ok === true) {
        message.textContent = successMessage;
        return;
    }
    if (result.ok === false) {
        message.textContent = result.message || "Unable to save permission status.";
        return;
    }
    message.textContent = "Unable to save permission status.";
}
async function queryPermission(name) {
    try {
        if (!navigator.permissions?.query)
            return "UNKNOWN";
        const status = await navigator.permissions.query({ name });
        return normalizePermissionState(status.state);
    }
    catch {
        return "UNKNOWN";
    }
}
function setPermission(kind, value) {
    if (kind === "camera") {
        state.cameraPermission = value;
    }
    else {
        state.microphonePermission = value;
    }
    render();
}
function render() {
    cameraStatus.textContent = formatStatus(state.cameraPermission);
    microphoneStatus.textContent = formatStatus(state.microphonePermission);
    locationStatus.textContent = formatStatus(state.locationPermission);
    cameraButton.disabled = !permissionConfig.cameraAccess;
    microphoneButton.disabled = !permissionConfig.microphoneAccess;
    locationButton.disabled = !permissionConfig.locationAccess;
    cameraButton.textContent = permissionConfig.cameraAccess
        ? "Request"
        : "Disabled";
    microphoneButton.textContent = permissionConfig.microphoneAccess
        ? "Request"
        : "Disabled";
    locationButton.textContent = permissionConfig.locationAccess
        ? "Request"
        : "Disabled";
}
function isPermissionEnabled(kind) {
    return kind === "camera"
        ? permissionConfig.cameraAccess
        : permissionConfig.microphoneAccess;
}
function shouldRequestPermission(value) {
    return value === "UNKNOWN" || value === "PROMPT";
}
function readPermissionError(error) {
    if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError") {
            return "DENIED";
        }
        if (error.name === "NotFoundError")
            return "UNAVAILABLE";
        if (error.name === "NotReadableError")
            return "RESTRICTED";
    }
    return "UNKNOWN";
}
function normalizePermissionState(value) {
    if (value === "granted")
        return "GRANTED";
    if (value === "denied")
        return "DENIED";
    if (value === "prompt")
        return "PROMPT";
    return "UNKNOWN";
}
function formatStatus(value) {
    return value
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
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
