type AgentDevicePermissionStatus =
  | "GRANTED"
  | "DENIED"
  | "PROMPT"
  | "RESTRICTED"
  | "UNAVAILABLE"
  | "UNKNOWN";

type AgentDevicePermissions = {
  cameraPermission: AgentDevicePermissionStatus;
  microphonePermission: AgentDevicePermissionStatus;
  locationPermission: AgentDevicePermissionStatus;
};

type DevicePermissionConfig = {
  cameraAccess: boolean;
  microphoneAccess: boolean;
  locationAccess: boolean;
};

type PermissionBridge = {
  getDevicePermissionConfig?: () => Promise<DevicePermissionConfig>;
  updateDevicePermissions?: (
    permissions: AgentDevicePermissions,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

const permissionWindow = window as Window & { dijiAgent?: PermissionBridge };

const state: AgentDevicePermissions = {
  cameraPermission: "UNKNOWN",
  microphonePermission: "UNKNOWN",
  locationPermission: "UNKNOWN",
};

let permissionConfig: DevicePermissionConfig = {
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
  state.locationPermission = permissionConfig.locationAccess
    ? await queryPermission("geolocation")
    : "UNAVAILABLE";
  render();
}

async function requestMediaPermission(kind: "camera" | "microphone") {
  if (!isPermissionEnabled(kind)) {
    setPermission(kind, "UNAVAILABLE");
    return;
  }

  const constraints =
    kind === "camera"
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
  } catch (error) {
    setPermission(kind, readPermissionError(error));
  }
}

async function requestLocationPermission() {
  if (!permissionConfig.locationAccess) {
    state.locationPermission = "UNAVAILABLE";
    render();
    return;
  }

  if (!navigator.geolocation) {
    state.locationPermission = "UNAVAILABLE";
    render();
    return;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(),
        (error) => reject(error),
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
      );
    });
    state.locationPermission = "GRANTED";
  } catch (error) {
    state.locationPermission = readPermissionError(error);
  } finally {
    render();
  }
}

async function requestEnabledPermissions() {
  if (
    permissionConfig.cameraAccess &&
    shouldRequestPermission(state.cameraPermission)
  ) {
    await requestMediaPermission("camera");
  }

  if (
    permissionConfig.microphoneAccess &&
    shouldRequestPermission(state.microphonePermission)
  ) {
    await requestMediaPermission("microphone");
  }

  if (
    permissionConfig.locationAccess &&
    shouldRequestPermission(state.locationPermission)
  ) {
    await requestLocationPermission();
  }
}

async function savePermissions(successMessage = "Permission status saved.") {
  message.textContent = "Saving...";

  const result =
    await permissionWindow.dijiAgent?.updateDevicePermissions?.(state);

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

async function queryPermission(name: PermissionName) {
  try {
    if (!navigator.permissions?.query) return "UNKNOWN";
    const status = await navigator.permissions.query({ name });
    return normalizePermissionState(status.state);
  } catch {
    return "UNKNOWN";
  }
}

function setPermission(
  kind: "camera" | "microphone",
  value: AgentDevicePermissionStatus,
) {
  if (kind === "camera") {
    state.cameraPermission = value;
  } else {
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

function isPermissionEnabled(kind: "camera" | "microphone") {
  return kind === "camera"
    ? permissionConfig.cameraAccess
    : permissionConfig.microphoneAccess;
}

function shouldRequestPermission(value: AgentDevicePermissionStatus) {
  return value === "UNKNOWN" || value === "PROMPT";
}

function readPermissionError(error: unknown): AgentDevicePermissionStatus {
  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      return "DENIED";
    }
    if (error.name === "NotFoundError") return "UNAVAILABLE";
    if (error.name === "NotReadableError") return "RESTRICTED";
  }

  return "UNKNOWN";
}

function normalizePermissionState(value: PermissionState) {
  if (value === "granted") return "GRANTED";
  if (value === "denied") return "DENIED";
  if (value === "prompt") return "PROMPT";
  return "UNKNOWN";
}

function formatStatus(value: AgentDevicePermissionStatus) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getButton(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${id}`);
  }
  return element;
}

function getElement(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

export {};
