using System.Text.Json.Serialization;

namespace DijiPeople.Gateway.Cloud;

/// <summary>
/// The wire shapes the gateway exchanges with DijiPeople.
///
/// Every response is validated after deserialisation (see
/// <see cref="CloudResponseValidator"/>) before anything acts on it. A gateway
/// that trusted whatever JSON arrived would be one compromised or misconfigured
/// endpoint away from being told to poll an arbitrary address.
///
/// TENANT ID APPEARS NOWHERE. Not in a request, not in a response the gateway
/// acts on. Tenancy is the server's conclusion from the credential.
/// </summary>

// ------------------------------------------------------------------ pairing

public sealed class PairRequest
{
    public string PairingCode { get; set; } = string.Empty;
    public string? Version { get; set; }
    public string? Platform { get; set; }
    public string? Architecture { get; set; }
    public string[]? Capabilities { get; set; }
}

public sealed class PairResponse
{
    public string GatewayId { get; set; } = string.Empty;
    /// <summary>Returned exactly once. Protected and stored, never logged.</summary>
    public string Credential { get; set; } = string.Empty;
    public string? TokenPrefix { get; set; }
}

// ---------------------------------------------------------------- heartbeat

public sealed class HeartbeatRequest
{
    public string? Version { get; set; }
    public string? Platform { get; set; }
    public string? Architecture { get; set; }
    public string[]? Capabilities { get; set; }
    public string? LocalTimestamp { get; set; }
    public int DevicesOnline { get; set; }
    public int DevicesUnreachable { get; set; }
    public int PendingQueueCount { get; set; }
    public string? OldestPendingEventAt { get; set; }
    public string? LastSuccessfulUploadAt { get; set; }
    public string? InstallationId { get; set; }
    public bool Degraded { get; set; }
}

public sealed class HeartbeatResponse
{
    public string? Status { get; set; }
    public string? AcknowledgedAt { get; set; }
    public string? ServerTimeUtc { get; set; }
}

// ------------------------------------------------------------ configuration

public sealed class GatewayConfiguration
{
    public string GatewayId { get; set; } = string.Empty;
    public string GatewayName { get; set; } = string.Empty;
    public string ServerTimeUtc { get; set; } = string.Empty;
    public string ConfigVersion { get; set; } = string.Empty;
    public GatewayRuntimePolicy Policy { get; set; } = new();
    public List<IntegrationConfiguration> Integrations { get; set; } = new();
}

public sealed class GatewayRuntimePolicy
{
    public int HeartbeatIntervalSeconds { get; set; } = 60;
    public int ConfigRefreshSeconds { get; set; } = 300;
    public int UploadBatchSize { get; set; } = 500;
    public int MaxEventsPerRequest { get; set; } = 5000;
    public int ClockDriftWarningSeconds { get; set; } = 60;
    public int ClockDriftCriticalSeconds { get; set; } = 300;
    public bool IntegrationEnabled { get; set; }
}

public sealed class IntegrationConfiguration
{
    public string IntegrationId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string ConnectorType { get; set; } = string.Empty;
    public string ConnectionMode { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool IsActive { get; set; }

    /// <summary>
    /// Connector settings, including the decrypted secrets this integration
    /// needs to open a device session. Held in memory and in no log line.
    /// </summary>
    public Dictionary<string, object?> Configuration { get; set; } = new();

    public List<string> Capabilities { get; set; } = new();

    /// <summary>
    /// Declared but unproven against hardware. The gateway must not run these
    /// unattended, whatever a job row asks for.
    /// </summary>
    public List<string> ExperimentalCapabilities { get; set; } = new();

    public int MinimumIntervalMinutes { get; set; } = 15;
    public List<DeviceConfiguration> Devices { get; set; } = new();
}

public sealed class DeviceConfiguration
{
    public string DeviceId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? ExpectedSerialNumber { get; set; }
    public string? Host { get; set; }
    public int? Port { get; set; }
    public int? MachineNumber { get; set; }
    public string? Timezone { get; set; }
    public string? DirectionMode { get; set; }
    public string Status { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public Dictionary<string, object?> Configuration { get; set; } = new();
    public SyncPolicyConfiguration? SyncPolicy { get; set; }
    public DateTimeOffset? SyncRequestedAt { get; set; }
    public string? VerificationStatus { get; set; }
    public DateTimeOffset? LastVerifiedAt { get; set; }

    /// <summary>
    /// True when no timezone is configured anywhere for this device. The gateway
    /// refuses to substitute its own — a terminal in another timezone would
    /// otherwise have every punch silently recorded at the wrong time.
    /// </summary>
    public bool TimezoneMissing { get; set; }
}

public sealed class SyncPolicyConfiguration
{
    public string Mode { get; set; } = "POLL";
    public int IntervalMinutes { get; set; } = 30;
    public bool IntervalClamped { get; set; }
    public string? ActiveWindowStart { get; set; }
    public string? ActiveWindowEnd { get; set; }
    public string? Timezone { get; set; }
    public int JitterSeconds { get; set; }
    public int MaxConcurrency { get; set; } = 1;
    public int RetryIntervalMinutes { get; set; } = 5;
    public int MaxRetries { get; set; } = 3;
    public string? Source { get; set; }
}

// -------------------------------------------------------------- attendance

public sealed class AttendanceBatchRequest
{
    public string IntegrationId { get; set; } = string.Empty;
    public string? DeviceId { get; set; }
    public List<AttendanceEventPayload> Events { get; set; } = new();
}

/// <summary>
/// One punch as it goes on the wire.
///
/// This is an explicit allowlist, not a dump of whatever the SDK returned. There
/// is no field here for a password buffer, a biometric template or a raw COM
/// object, so none can be transmitted even by accident.
/// </summary>
public sealed class AttendanceEventPayload
{
    public string ExternalUserId { get; set; } = string.Empty;

    /// <summary>Device wall clock, "yyyy-MM-ddTHH:mm:ss". Never suffixed with Z.</summary>
    public string OccurredAtLocal { get; set; } = string.Empty;

    public int? VerificationModeRaw { get; set; }
    public int? PunchStateRaw { get; set; }
    public int? WorkCodeRaw { get; set; }
    public string EventFingerprint { get; set; } = string.Empty;

    /// <summary>The device's configured timezone. Absent stops the upload.</summary>
    public string? DeviceTimezone { get; set; }
}

public sealed class AttendanceBatchResponse
{
    public int Received { get; set; }
    public int Inserted { get; set; }
    public int Duplicates { get; set; }
    public int Mapped { get; set; }
    public int Unmapped { get; set; }
    public int Invalid { get; set; }
    public int Failed { get; set; }
}

// --------------------------------------------------------------- discovery

public sealed class DiscoveredUsersRequest
{
    public string IntegrationId { get; set; } = string.Empty;
    public string? DeviceId { get; set; }
    public List<DiscoveredUserPayload> Users { get; set; } = new();
}

public sealed class DiscoveredUserPayload
{
    public string ExternalUserId { get; set; } = string.Empty;
    public string? Name { get; set; }
    public int? PrivilegeRaw { get; set; }
    public bool? Enabled { get; set; }
    // No password property. The worker discards the value the SDK returns before
    // it can cross a process boundary, and there is nowhere here for one to land.
}

public sealed class DiscoveredUsersResponse
{
    public int Received { get; set; }
    public int Recorded { get; set; }
    public int AutoMapped { get; set; }
    public int Suggested { get; set; }
    public int Failed { get; set; }
}

// ------------------------------------------------------------ verification

public sealed class VerificationRequest
{
    public string DeviceId { get; set; } = string.Empty;
    public bool Connected { get; set; }
    public int? LatencyMs { get; set; }
    public string? ActualSerialNumber { get; set; }
    public string? Model { get; set; }
    public string? FirmwareVersion { get; set; }
    public string? Platform { get; set; }
    public string? MacAddress { get; set; }
    public string? DeviceTimeLocal { get; set; }
    public int? ClockDriftSeconds { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
}

public sealed class VerificationResponse
{
    public string DeviceId { get; set; } = string.Empty;
    public string VerificationStatus { get; set; } = string.Empty;
    public string HealthStatus { get; set; } = string.Empty;
    public bool? SerialMatches { get; set; }
    public int? ClockDriftSeconds { get; set; }
    public string? ClockDriftSeverity { get; set; }
}

// -------------------------------------------------------------------- runs

public sealed class RunReportRequest
{
    public string IntegrationId { get; set; } = string.Empty;
    public string? DeviceId { get; set; }
    public string RunType { get; set; } = "ATTENDANCE_PULL";
    public string Status { get; set; } = "SUCCEEDED";
    public string StartedAt { get; set; } = string.Empty;
    public string? CompletedAt { get; set; }
    public int DurationMs { get; set; }
    public int RecordsRead { get; set; }
    public int RecordsNew { get; set; }
    public int RecordsDuplicate { get; set; }
    public int RecordsMapped { get; set; }
    public int RecordsUnmapped { get; set; }
    public int RecordsFailed { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public string? CorrelationId { get; set; }
    public string? AcknowledgesSyncRequestedAt { get; set; }
}

public sealed class RunReportResponse
{
    public string RunId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}

// ------------------------------------------------------------ provisioning

public sealed class ClaimJobsRequest
{
    public int Limit { get; set; } = 10;
    public List<string>? DeviceIds { get; set; }
}

public sealed class ClaimJobsResponse
{
    public List<ProvisioningJob> Claimed { get; set; } = new();
    public int SkippedUncertified { get; set; }
    public bool Disabled { get; set; }
}

public sealed class ProvisioningJob
{
    public string JobId { get; set; } = string.Empty;
    public string Operation { get; set; } = string.Empty;
    public DateTimeOffset LeaseExpiresAt { get; set; }
    public int Attempt { get; set; }
    public int MaxAttempts { get; set; }
    public string IntegrationId { get; set; } = string.Empty;
    public string ConnectorType { get; set; } = string.Empty;
    public ProvisioningJobDevice Device { get; set; } = new();
    public ProvisioningJobPayload Payload { get; set; } = new();
}

public sealed class ProvisioningJobDevice
{
    public string DeviceId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? ExpectedSerialNumber { get; set; }
    public string? Host { get; set; }
    public int? Port { get; set; }
    public int? MachineNumber { get; set; }
}

public sealed class ProvisioningJobPayload
{
    public string ExternalUserId { get; set; } = string.Empty;
    public string EmployeeCode { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool Enabled { get; set; }
}

public sealed class ProvisioningResultRequest
{
    public string JobId { get; set; } = string.Empty;
    public bool Succeeded { get; set; }
    public string? ResultExternalUserId { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
}

public sealed class ProvisioningResultResponse
{
    public string JobId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}

/// <summary>Error body shape the API returns. Only the message is ever surfaced.</summary>
public sealed class ApiErrorBody
{
    [JsonPropertyName("message")]
    public JsonElementOrString? Message { get; set; }

    [JsonPropertyName("statusCode")]
    public int? StatusCode { get; set; }
}

/// <summary>The API returns `message` as either a string or an array of strings.</summary>
[JsonConverter(typeof(JsonElementOrStringConverter))]
public sealed class JsonElementOrString
{
    public string Value { get; init; } = string.Empty;
    public override string ToString() => Value;
}
