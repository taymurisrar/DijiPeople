using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Storage;

namespace DijiPeople.Gateway.Connectors;

/// <summary>
/// The runtime contract every attendance connector implements.
///
/// Deliberately NOT the same thing as the connector definition in the web API.
/// That one is metadata an administrator configures against — labels, field
/// schemas, declared capabilities. This one is behaviour: what actually happens
/// when the gateway needs to reach a terminal. Keeping them apart is what lets
/// the API describe a connector the gateway has no adapter for (and refuse to
/// schedule it) instead of the two definitions being forced to move together.
///
/// Nothing in the scheduler, the queue or the uploader knows what a ZKTeco is.
/// They resolve a connector by type from the registry and call these methods, so
/// adding Hikvision means adding one implementation and one registry entry.
///
/// No capability here reads or transmits biometric data. There is no method for
/// it, so no connector can be written that does.
/// </summary>
public interface IGatewayAttendanceConnector
{
    /// <summary>Matches AttendanceIntegration.connectorType in DijiPeople.</summary>
    string ConnectorType { get; }

    /// <summary>
    /// What this adapter can actually do, in the same vocabulary the API's
    /// connector definition uses. The scheduler consults this rather than
    /// testing the provider name.
    /// </summary>
    IReadOnlySet<string> Capabilities { get; }

    /// <summary>
    /// Reaches the terminal and reports what answered. Read-only: identity and
    /// clock, nothing written, nothing cleared.
    /// </summary>
    Task<DeviceVerificationResult> VerifyDeviceAsync(
        ConnectorDeviceContext context,
        CancellationToken cancellationToken);

    /// <summary>Reads the device's user directory. Identity fields only.</summary>
    Task<UserDiscoveryResult> DiscoverUsersAsync(
        ConnectorDeviceContext context,
        CancellationToken cancellationToken);

    /// <summary>Reads raw punches. Nothing is interpreted or classified here.</summary>
    Task<AttendanceReadResult> ReadAttendanceAsync(
        ConnectorDeviceContext context,
        CancellationToken cancellationToken);

    /// <summary>
    /// Writes an employee identity to the terminal.
    ///
    /// Implementations MUST refuse unless the capability is certified for
    /// automation. An adapter whose write path has never been executed against
    /// physical hardware returns a refusal rather than attempting it.
    /// </summary>
    Task<ProvisioningExecutionResult> ProvisionUserAsync(
        ConnectorDeviceContext context,
        ProvisioningJobPayload payload,
        string operation,
        CancellationToken cancellationToken);
}

/// <summary>
/// Everything an adapter needs about one device, resolved from the cloud
/// configuration. Assembled per call and not retained, so a configuration
/// refresh takes effect on the next sync without restarting anything.
/// </summary>
public sealed class ConnectorDeviceContext
{
    public required string DeviceId { get; init; }
    public required string DeviceName { get; init; }
    public required string IntegrationId { get; init; }
    public required string Host { get; init; }
    public required int Port { get; init; }
    public required int MachineNumber { get; init; }

    /// <summary>Configured serial, when the administrator supplied one to check.</summary>
    public string? ExpectedSerialNumber { get; init; }

    /// <summary>
    /// The device's timezone. Null is a configuration fault, never a licence to
    /// substitute the gateway's own — the terminal may not be in the same zone.
    /// </summary>
    public string? Timezone { get; init; }

    /// <summary>
    /// Connector settings including decrypted secrets. Held for the duration of
    /// the call and never written to the local database or a log line.
    /// </summary>
    public required IReadOnlyDictionary<string, object?> Configuration { get; init; }

    /// <summary>Safety cap on how many records one read may enumerate.</summary>
    public int MaxRecords { get; init; } = 1_000_000;
}

public sealed record DeviceVerificationResult(
    bool Connected,
    int LatencyMs,
    string? SerialNumber,
    string? Model,
    string? FirmwareVersion,
    string? Platform,
    string? MacAddress,
    /// <summary>Device wall clock as reported. No offset attached, ever.</summary>
    string? DeviceTimeLocal,
    string? ErrorCode,
    string? ErrorMessage);

public sealed record DiscoveredUser(
    string ExternalUserId,
    string? Name,
    int? PrivilegeRaw,
    bool? Enabled);

public sealed record UserDiscoveryResult(
    bool Succeeded,
    IReadOnlyList<DiscoveredUser> Users,
    string? SerialNumber,
    string? ErrorCode,
    string? ErrorMessage);

public sealed record AttendanceReadResult(
    bool Succeeded,
    IReadOnlyList<ObservedPunch> Punches,
    string? SerialNumber,
    string? DeviceTimeLocal,
    string? ErrorCode,
    string? ErrorMessage);

public sealed record ProvisioningExecutionResult(
    bool Succeeded,
    string? ResultExternalUserId,
    string? ErrorCode,
    string? ErrorMessage);
