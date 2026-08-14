using System.Text.Json.Serialization;

namespace DijiPeople.Gateway.Connectors.ZkTeco;

/// <summary>
/// The x86 worker's JSON contract, mirrored on the host side.
///
/// The worker also prints a human-readable report; the gateway never reads it.
/// Parsing console output would make a formatting change a production incident,
/// so the runtime always passes --json and reads this shape. The report stays
/// for support engineers running the executable by hand.
///
/// There is no password field and no biometric field anywhere in this contract.
/// The worker discards the password the SDK hands back before the call returns,
/// so there is nothing for one to be deserialised into.
/// </summary>
internal sealed class WorkerResult
{
    /// <summary>
    /// Bumped by the worker on any breaking shape change. The gateway refuses a
    /// mismatched worker rather than misreading it — a silently misparsed punch
    /// is worse than a failed sync, because it looks like data.
    /// </summary>
    public const int SupportedContractVersion = 1;

    [JsonPropertyName("contractVersion")]
    public int ContractVersion { get; set; }

    public string? Mode { get; set; }
    public WorkerRuntime? Runtime { get; set; }
    public WorkerCom? Com { get; set; }
    public WorkerConnection? Connection { get; set; }
    public WorkerDevice? Device { get; set; }
    public List<WorkerUser>? Users { get; set; }
    public List<WorkerPunch>? Attendance { get; set; }
    public List<string>? Diagnostics { get; set; }
    public WorkerError? Error { get; set; }
}

internal sealed class WorkerRuntime
{
    /// <summary>
    /// Must be false. zkemkeeper is registered only under WOW6432Node, so a
    /// 64-bit worker cannot have talked to it — a true here means the wrong
    /// binary is deployed and any result it produced is not trustworthy.
    /// </summary>
    public bool Is64BitProcess { get; set; }

    public string? ProcessArchitecture { get; set; }
    public string? Framework { get; set; }
    public string? OsVersion { get; set; }
}

internal sealed class WorkerCom
{
    public string? ProgId { get; set; }
    public bool Instantiated { get; set; }
}

internal sealed class WorkerConnection
{
    public string? Host { get; set; }
    public int Port { get; set; }
    public int MachineNumber { get; set; }
    public bool Connected { get; set; }
    public long ConnectDurationMs { get; set; }
    public bool Disconnected { get; set; }
}

internal sealed class WorkerDevice
{
    public string? Manufacturer { get; set; }
    public string? Model { get; set; }
    public string? SerialNumber { get; set; }
    public string? FirmwareVersion { get; set; }
    public string? Platform { get; set; }
    public string? MacAddress { get; set; }

    /// <summary>"yyyy-MM-ddTHH:mm:ss" wall clock. The device states no offset.</summary>
    public string? DeviceTimeLocal { get; set; }
}

internal sealed class WorkerUser
{
    public string? ExternalUserId { get; set; }
    public string? Name { get; set; }
    public int? PrivilegeRaw { get; set; }
    public bool? Enabled { get; set; }
}

internal sealed class WorkerPunch
{
    public string? ExternalUserId { get; set; }
    public string? OccurredAtLocal { get; set; }
    public int? VerificationModeRaw { get; set; }
    public int? PunchStateRaw { get; set; }
    public int? WorkCodeRaw { get; set; }
}

internal sealed class WorkerError
{
    public string? Code { get; set; }
    public string? Message { get; set; }
    public string? HResult { get; set; }
    public int? SdkErrorCode { get; set; }
}
