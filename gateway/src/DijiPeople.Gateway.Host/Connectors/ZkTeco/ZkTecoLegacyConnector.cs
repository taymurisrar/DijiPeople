using System.Globalization;
using System.Text.RegularExpressions;

using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Storage;

using Microsoft.Extensions.Logging;

namespace DijiPeople.Gateway.Connectors.ZkTeco;

/// <summary>
/// ZKTeco standalone terminals over the legacy zkemkeeper SDK.
///
/// Every safety property proved by the diagnostic POC is preserved here, because
/// this adapter runs the same worker binary rather than reimplementing the COM
/// calls:
///
///   x86 enforced three ways · read-only method allowlist · Disconnect and COM
///   release in a finally · no biometric read · device password discarded inside
///   the worker · no log clearing · no clock mutation · no user mutation during
///   attendance sync.
///
/// ReadLastestLogData, ReadMark, SetLastCount, ClearGLog and ClearData are not
/// on the worker's allowlist and are never invoked. That matters beyond
/// tidiness: the customer's V2011 software reads the same terminal and shares
/// any device-side read marker, so advancing one would make V2011's next
/// incremental download silently skip records with no way to undo it.
///
/// WHAT THIS ADAPTER CANNOT DO. The installed SDK exposes neither a time-bounded
/// read nor a new-only read, confirmed against the physical device. Every poll
/// therefore returns the terminal's entire stored history. Deduplication and the
/// import window both live on the DijiPeople side, which is why the local
/// fingerprint store is not an optimisation but the mechanism.
/// </summary>
internal sealed class ZkTecoLegacyConnector : IGatewayAttendanceConnector
{
    private readonly ZkTecoWorkerClient _worker;
    private readonly ILogger<ZkTecoLegacyConnector> _logger;

    /// <summary>Matches AttendanceIntegration.connectorType in DijiPeople.</summary>
    public string ConnectorType => "zkteco-legacy-tcp";

    /// <summary>
    /// WRITE_USERS is deliberately ABSENT.
    ///
    /// The SDK exposes a user write path and the API's connector definition
    /// declares it as an experimental capability, but it has never been executed
    /// against a physical terminal. Until that validation happens on the
    /// customer's device, this adapter must not advertise a capability the
    /// scheduler would then act on unattended. Adding it here before the
    /// hardware test would make the gate a formality.
    /// </summary>
    public IReadOnlySet<string> Capabilities { get; } = new HashSet<string>(StringComparer.Ordinal)
    {
        "READ_DEVICE_INFO",
        "READ_USERS",
        "READ_ATTENDANCE",
        "POLL_EVENTS",
        "DEVICE_TIME",
        "PUNCH_STATE",
        "WORK_CODE",
        "LOCAL_GATEWAY_REQUIRED",
    };

    /// <summary>Device wall clock. Anything else is not a timestamp we will send.</summary>
    private static readonly Regex LocalTimestamp = new(
        @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$",
        RegexOptions.Compiled);

    public ZkTecoLegacyConnector(
        ZkTecoWorkerClient worker,
        ILogger<ZkTecoLegacyConnector> logger)
    {
        _worker = worker;
        _logger = logger;
    }

    // ------------------------------------------------------------- verify

    public async Task<DeviceVerificationResult> VerifyDeviceAsync(
        ConnectorDeviceContext context,
        CancellationToken cancellationToken)
    {
        // --device-info connects, reads identity and the clock, and disconnects.
        // It writes nothing and touches no log marker.
        var invocation = await _worker.InvokeAsync(
            BuildArguments(context, "--device-info"),
            cancellationToken);

        if (!invocation.Succeeded || invocation.Result is null)
        {
            return new DeviceVerificationResult(
                Connected: false,
                LatencyMs: invocation.DurationMs,
                SerialNumber: null,
                Model: null,
                FirmwareVersion: null,
                Platform: null,
                MacAddress: null,
                DeviceTimeLocal: null,
                ErrorCode: invocation.ErrorCode ?? "DEVICE_UNREACHABLE",
                ErrorMessage: invocation.ErrorMessage);
        }

        var result = invocation.Result;
        var device = result.Device;

        return new DeviceVerificationResult(
            Connected: result.Connection?.Connected ?? false,
            // The SDK's own connect timing, not the whole process lifetime —
            // process start-up would otherwise show as device latency.
            LatencyMs: (int)(result.Connection?.ConnectDurationMs ?? invocation.DurationMs),
            SerialNumber: Clean(device?.SerialNumber),
            Model: Clean(device?.Model),
            FirmwareVersion: Clean(device?.FirmwareVersion),
            Platform: Clean(device?.Platform),
            MacAddress: Clean(device?.MacAddress),
            DeviceTimeLocal: ValidLocalTimestamp(device?.DeviceTimeLocal),
            ErrorCode: null,
            ErrorMessage: null);
    }

    // ------------------------------------------------------------ discover

    public async Task<UserDiscoveryResult> DiscoverUsersAsync(
        ConnectorDeviceContext context,
        CancellationToken cancellationToken)
    {
        var arguments = BuildArguments(context, "--users");
        arguments.Add("--max-users");
        arguments.Add(context.MaxRecords.ToString(CultureInfo.InvariantCulture));

        var invocation = await _worker.InvokeAsync(arguments, cancellationToken);

        if (!invocation.Succeeded || invocation.Result is null)
        {
            return new UserDiscoveryResult(
                false,
                Array.Empty<DiscoveredUser>(),
                null,
                invocation.ErrorCode ?? "READ_USERS_FAILED",
                invocation.ErrorMessage);
        }

        var users = new List<DiscoveredUser>();

        foreach (var user in invocation.Result.Users ?? new List<WorkerUser>())
        {
            var externalUserId = Clean(user.ExternalUserId);
            if (externalUserId is null)
            {
                // A directory slot with no identifier is not a person we can map.
                continue;
            }

            // Explicit projection, not a copy of the worker object. Only these
            // four fields exist on the wire, so nothing else can travel even if
            // the worker contract grows a field later.
            users.Add(new DiscoveredUser(
                externalUserId,
                Clean(user.Name),
                user.PrivilegeRaw,
                user.Enabled));
        }

        return new UserDiscoveryResult(
            true,
            users,
            Clean(invocation.Result.Device?.SerialNumber),
            null,
            null);
    }

    // ---------------------------------------------------------- attendance

    public async Task<AttendanceReadResult> ReadAttendanceAsync(
        ConnectorDeviceContext context,
        CancellationToken cancellationToken)
    {
        var arguments = BuildArguments(context, "--attendance");
        // A safety ceiling on the enumeration loop, not an incremental read:
        // ReadGeneralLogData has already buffered the device's whole history by
        // the time this bounds anything. Treating it as "only fetch N" would be
        // a misreading with real consequences.
        arguments.Add("--max-attendance");
        arguments.Add(context.MaxRecords.ToString(CultureInfo.InvariantCulture));

        var invocation = await _worker.InvokeAsync(arguments, cancellationToken);

        if (!invocation.Succeeded || invocation.Result is null)
        {
            return new AttendanceReadResult(
                false,
                Array.Empty<ObservedPunch>(),
                null,
                null,
                invocation.ErrorCode ?? "READ_ATTENDANCE_FAILED",
                invocation.ErrorMessage);
        }

        var serial = Clean(invocation.Result.Device?.SerialNumber);
        var punches = new List<ObservedPunch>();
        var malformed = 0;

        foreach (var punch in invocation.Result.Attendance ?? new List<WorkerPunch>())
        {
            var externalUserId = Clean(punch.ExternalUserId);
            var occurredAtLocal = ValidLocalTimestamp(punch.OccurredAtLocal);

            if (externalUserId is null || occurredAtLocal is null)
            {
                malformed++;
                continue;
            }

            punches.Add(new ObservedPunch(
                externalUserId,
                occurredAtLocal,
                punch.VerificationModeRaw,
                punch.PunchStateRaw,
                punch.WorkCodeRaw,
                EventFingerprint.Compute(
                    serial,
                    externalUserId,
                    occurredAtLocal,
                    punch.VerificationModeRaw,
                    punch.PunchStateRaw,
                    punch.WorkCodeRaw)));
        }

        if (malformed > 0)
        {
            // Dropped rather than guessed at. A punch with no user or no usable
            // timestamp cannot be attributed to anyone or placed in time, and
            // inventing either would put a fiction into payroll evidence.
            _logger.LogWarning(
                "Device {Device} returned {Count} attendance record(s) with no usable user or timestamp; they were not queued.",
                context.DeviceName,
                malformed);
        }

        return new AttendanceReadResult(
            true,
            punches,
            serial,
            ValidLocalTimestamp(invocation.Result.Device?.DeviceTimeLocal),
            null,
            null);
    }

    // --------------------------------------------------------- provisioning

    /// <summary>
    /// Refuses, by design, until the write path is validated on hardware.
    ///
    /// This is not a stub standing in for missing code — the transport, the job
    /// lease, the claim and the reporting path are all built and exercised. What
    /// is missing is a physical test on the customer's terminal proving which
    /// SDK write calls are safe and what they do to a device the customer's
    /// V2011 software also manages. Guessing at that against a production
    /// terminal is the one thing this phase must not do, so the refusal is the
    /// correct behaviour and is reported honestly rather than silently
    /// succeeding.
    /// </summary>
    public Task<ProvisioningExecutionResult> ProvisionUserAsync(
        ConnectorDeviceContext context,
        ProvisioningJobPayload payload,
        string operation,
        CancellationToken cancellationToken)
    {
        _logger.LogWarning(
            "Refused provisioning job ({Operation}) for device {Device}: ZKTeco write-back is not certified.",
            operation,
            context.DeviceName);

        return Task.FromResult(new ProvisioningExecutionResult(
            Succeeded: false,
            ResultExternalUserId: null,
            ErrorCode: "WRITE_NOT_CERTIFIED",
            ErrorMessage:
            "Writing users to ZKTeco terminals has not been validated against physical hardware, so this gateway will not attempt it."));
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>
    /// Builds the worker command line for one device.
    ///
    /// The comm key comes from the integration's encrypted configuration and is
    /// omitted entirely when it is zero — the reference K50's setting — which
    /// keeps the exact call sequence the POC validated. It is masked whenever
    /// this list is logged.
    /// </summary>
    private static List<string> BuildArguments(ConnectorDeviceContext context, string mode)
    {
        var arguments = new List<string>
        {
            mode,
            "--host", context.Host,
            "--port", context.Port.ToString(CultureInfo.InvariantCulture),
            "--machine-number", context.MachineNumber.ToString(CultureInfo.InvariantCulture),
        };

        var commKey = ReadCommKey(context.Configuration);
        if (commKey > 0)
        {
            arguments.Add("--comm-key");
            arguments.Add(commKey.ToString(CultureInfo.InvariantCulture));
        }

        return arguments;
    }

    /// <summary>
    /// Reads the comm key from connector configuration.
    ///
    /// Tolerant of both a JSON number and a string, because the field is a
    /// secret and secrets round-trip through encrypted JSON where a number can
    /// arrive quoted. An unparseable value becomes 0, which means "no key" —
    /// the same as not configuring one, and safely wrong rather than sending
    /// garbage to the terminal.
    /// </summary>
    internal static int ReadCommKey(IReadOnlyDictionary<string, object?> configuration)
    {
        if (!configuration.TryGetValue("commKey", out var raw) || raw is null)
        {
            return 0;
        }

        return raw switch
        {
            int value => value,
            long value => (int)value,
            double value => (int)value,
            string text when int.TryParse(
                text.Trim(),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var parsed) => parsed,
            System.Text.Json.JsonElement element => ReadCommKeyFromJson(element),
            _ => 0,
        };
    }

    private static int ReadCommKeyFromJson(System.Text.Json.JsonElement element) =>
        element.ValueKind switch
        {
            System.Text.Json.JsonValueKind.Number when element.TryGetInt32(out var number) => number,
            System.Text.Json.JsonValueKind.String when int.TryParse(
                element.GetString(),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var parsed) => parsed,
            _ => 0,
        };

    private static string? Clean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length > 200 ? trimmed[..200] : trimmed;
    }

    /// <summary>
    /// Accepts a device timestamp only in the exact wall-clock form.
    ///
    /// No parsing into a DateTime, no normalisation, no offset. The terminal
    /// states no timezone, so treating its string as a UTC instant — which
    /// DateTime.Parse would happily do for some inputs — would shift every punch
    /// by the gateway machine's offset.
    /// </summary>
    private static string? ValidLocalTimestamp(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return LocalTimestamp.IsMatch(trimmed) ? trimmed : null;
    }
}
