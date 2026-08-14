using System.Text.Json.Serialization;

namespace DijiPeople.ZkTeco.Worker;

/// <summary>
/// The worker's stdout contract. The TypeScript CLI is the only consumer.
/// Bump <see cref="ContractVersion"/> on any breaking shape change so the
/// caller can refuse a mismatched worker binary instead of misreading it.
///
/// NOTHING biometric and NO password field exists anywhere in this contract.
/// That is deliberate: values the SDK hands back that we must not keep are
/// discarded inside the adapter and have no place to land here.
/// </summary>
public sealed class WorkerResult
{
    public const int ContractVersion = 1;

    [JsonPropertyName("contractVersion")]
    public int Version => ContractVersion;

    /// <summary>Which diagnostic mode produced this result.</summary>
    public string Mode { get; set; } = "poc";

    public RuntimeInfo Runtime { get; set; } = new();

    public ComInfo Com { get; set; } = new();

    public ConnectionInfo? Connection { get; set; }

    public DeviceInfo? Device { get; set; }

    public List<WorkerUser>? Users { get; set; }

    public List<WorkerPunch>? Attendance { get; set; }

    public SdkCapabilities? Capabilities { get; set; }

    /// <summary>Populated only when --probe-latest-log was explicitly requested.</summary>
    public LatestLogProbeResult? LatestLogProbe { get; set; }

    /// <summary>Ordered, human-readable trace of what the worker did.</summary>
    public List<string> Diagnostics { get; set; } = new();

    public WorkerError? Error { get; set; }
}

public sealed class RuntimeInfo
{
    public bool Is64BitProcess { get; set; }
    public string ProcessArchitecture { get; set; } = string.Empty;
    public string Framework { get; set; } = string.Empty;
    public string OsVersion { get; set; } = string.Empty;
    public bool Is64BitOperatingSystem { get; set; }
}

public sealed class ComInfo
{
    public string ProgId { get; set; } = string.Empty;
    public string? Clsid { get; set; }
    public bool Instantiated { get; set; }
}

public sealed class ConnectionInfo
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
    public int MachineNumber { get; set; }
    public bool Connected { get; set; }
    public long ConnectDurationMs { get; set; }
    public bool Disconnected { get; set; }
    /// <summary>True only when a non-zero comm key was supplied by configuration.</summary>
    public bool CommKeyApplied { get; set; }
}

public sealed class DeviceInfo
{
    public string Manufacturer { get; set; } = "ZKTeco";
    public string? Model { get; set; }
    public string? SerialNumber { get; set; }
    public string? FirmwareVersion { get; set; }
    public string? Platform { get; set; }
    public string? MacAddress { get; set; }
    public int MachineNumber { get; set; }
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
    /// <summary>Device wall clock as "yyyy-MM-ddTHH:mm:ss". No timezone is implied.</summary>
    public string? DeviceTimeLocal { get; set; }

    /// <summary>
    /// Raw GetDeviceStatus values keyed by the numeric status code. The meaning
    /// of each code is NOT asserted here — the SDK's own documentation must be
    /// consulted before these are given names.
    /// </summary>
    public Dictionary<string, int> DeviceStatusRaw { get; set; } = new();

    /// <summary>Optional metadata getters that returned false or threw.</summary>
    public List<string> UnavailableFields { get; set; } = new();
}

public sealed class WorkerUser
{
    public string ExternalUserId { get; set; } = string.Empty;
    public string? Name { get; set; }
    public int? PrivilegeRaw { get; set; }
    public bool? Enabled { get; set; }
    // No password property exists by design. See ZkemAdapter.ReadUsers.
}

public sealed class WorkerPunch
{
    public string ExternalUserId { get; set; } = string.Empty;
    /// <summary>"yyyy-MM-ddTHH:mm:ss" composed from the SDK's date/time parts.</summary>
    public string OccurredAtLocal { get; set; } = string.Empty;
    public int? VerificationModeRaw { get; set; }
    public int? PunchStateRaw { get; set; }
    public int? WorkCodeRaw { get; set; }
}

public sealed class SdkCapabilities
{
    /// <summary>False when the COM object exposed no ITypeInfo to enumerate.</summary>
    public bool TypeInfoAvailable { get; set; }

    /// <summary>Every method name the installed zkemkeeper actually exposes.</summary>
    public List<string> Methods { get; set; } = new();

    /// <summary>Full signature of every exposed method, from the type library.</summary>
    public List<SdkMethodSignature> Signatures { get; set; } = new();

    /// <summary>
    /// Signatures of the methods currently under investigation for incremental
    /// retrieval, pulled out so they are easy to read and to send back.
    /// </summary>
    public List<SdkMethodSignature> TargetSignatures { get; set; } = new();

    /// <summary>
    /// Subset of <see cref="Methods"/> whose names relate to log retrieval, so the
    /// question "does this SDK support incremental/time-ranged reads?" can be
    /// answered from the installed component rather than from documentation.
    /// </summary>
    public List<string> LogRelatedMethods { get; set; } = new();

    /// <summary>
    /// Methods whose names suggest they touch a read marker, a "last count" or a
    /// clear operation. Reported so a reviewer can see what device-side cursor
    /// machinery exists — NONE of these are ever called by this POC.
    /// </summary>
    public List<string> MarkerRelatedMethods { get; set; } = new();

    /// <summary>Presence check for named incremental-retrieval candidates.</summary>
    public Dictionary<string, bool> IncrementalCandidates { get; set; } = new();

    /// <summary>Set when --method narrowed the signature list.</summary>
    public string? FilteredBy { get; set; }

    public string? ProbeError { get; set; }
}

/// <summary>One method as declared in the component's type library.</summary>
public sealed class SdkMethodSignature
{
    public string Name { get; set; } = string.Empty;
    public int DispId { get; set; }
    public string InvokeKind { get; set; } = string.Empty;
    public string ReturnType { get; set; } = string.Empty;
    public int ParameterCount { get; set; }
    public int OptionalParameterCount { get; set; }
    public short FuncFlags { get; set; }
    /// <summary>Vendor help text, when the type library carries any.</summary>
    public string? HelpString { get; set; }
    public List<SdkParameter> Parameters { get; set; } = new();
    /// <summary>Rendered one-line declaration, for reports.</summary>
    public string Declaration { get; set; } = string.Empty;
}

public sealed class SdkParameter
{
    public int Position { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    /// <summary>"in", "out", "in/out" or "unspecified", as declared in IDL.</summary>
    public string Direction { get; set; } = string.Empty;
    public bool IsOptional { get; set; }
    public bool HasDefault { get; set; }
    public bool IsReturnValue { get; set; }
    public int RawFlags { get; set; }
}

/// <summary>
/// Result of the opt-in ReadLastestLogData probe. Present only when the probe
/// was explicitly requested; null on every default run.
/// </summary>
public sealed class LatestLogProbeResult
{
    /// <summary>The Read* method that was invoked to fill the SDK buffer.</summary>
    public string ReadMethod { get; set; } = string.Empty;
    /// <summary>The getter used to drain it.</summary>
    public string GetMethod { get; set; } = string.Empty;
    public bool ReadSucceeded { get; set; }
    public int RecordLimit { get; set; }
    public int RecordsReturned { get; set; }
    public List<WorkerPunch> Records { get; set; } = new();
    public string? Error { get; set; }
}

public sealed class WorkerError
{
    public string Code { get; set; } = "UNKNOWN_ERROR";
    public string Message { get; set; } = string.Empty;
    public string? HResult { get; set; }
    /// <summary>Value returned by the SDK's own GetLastError, when reachable.</summary>
    public int? SdkErrorCode { get; set; }
}
