using System.Diagnostics;
using System.Globalization;

using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Storage;

using Microsoft.Extensions.Logging;

namespace DijiPeople.Gateway.Runtime;

/// <summary>
/// Runs one operation against one device, end to end.
///
/// Everything here is per device and independent. A terminal that is unplugged,
/// answering slowly, or returning nonsense fails its own cycle, records its own
/// health, reports its own run, and leaves every other device and the service
/// itself untouched. That isolation is the point: a site with six terminals
/// should not lose five of them because one was switched off.
///
/// Reads never fail closed on the cloud. Punches are enqueued locally the moment
/// they are read; whether DijiPeople is reachable is the uploader's problem.
/// </summary>
public sealed class SyncRunner
{
    private readonly GatewayStore _store;
    private readonly ICloudClient _cloud;
    private readonly ConnectorRegistry _connectors;
    private readonly ILogger<SyncRunner> _logger;

    /// <summary>Consecutive failures before a device is called OFFLINE rather than ERROR.</summary>
    private const int OfflineAfterFailures = 3;

    /// <summary>Ceiling on records one read may enumerate, as a runaway guard.</summary>
    private const int MaxRecordsPerRead = 2_000_000;

    public SyncRunner(
        GatewayStore store,
        ICloudClient cloud,
        ConnectorRegistry connectors,
        ILogger<SyncRunner> logger)
    {
        _store = store;
        _cloud = cloud;
        _connectors = connectors;
        _logger = logger;
    }

    /// <summary>
    /// Reaches the terminal, checks its identity, and reports the result.
    ///
    /// Read-only. The device is not modified in any way, and a failure here is
    /// recorded rather than retried in a loop — an operator asked for a check
    /// and is owed its actual outcome.
    /// </summary>
    public async Task<bool> VerifyAsync(
        IntegrationConfiguration integration,
        DeviceConfiguration device,
        CancellationToken cancellationToken)
    {
        var connector = _connectors.Find(integration.ConnectorType);
        if (connector is null)
        {
            _logger.LogWarning(
                "No adapter for connector '{Connector}'; device {Device} cannot be verified by this gateway build.",
                integration.ConnectorType,
                device.Name);
            return false;
        }

        var context = BuildContext(integration, device);
        var result = await connector.VerifyDeviceAsync(context, cancellationToken);

        var drift = ComputeClockDrift(result.DeviceTimeLocal, DateTimeOffset.Now);

        var request = new VerificationRequest
        {
            DeviceId = device.DeviceId,
            Connected = result.Connected,
            LatencyMs = result.LatencyMs,
            ActualSerialNumber = result.SerialNumber,
            Model = result.Model,
            FirmwareVersion = result.FirmwareVersion,
            Platform = result.Platform,
            MacAddress = result.MacAddress,
            DeviceTimeLocal = result.DeviceTimeLocal,
            ClockDriftSeconds = drift,
            ErrorCode = result.ErrorCode,
            ErrorMessage = result.ErrorMessage,
        };

        try
        {
            var response = await _cloud.ReportVerificationAsync(request, cancellationToken);

            if (result.Connected)
            {
                await _store.RecordVerifiedAsync(
                    device.DeviceId,
                    DateTimeOffset.UtcNow,
                    cancellationToken);
            }

            _logger.LogInformation(
                "Verified {Device}: {Status}, serial match {Match}, clock drift {Drift}.",
                device.Name,
                response.VerificationStatus,
                response.SerialMatches?.ToString() ?? "not checked",
                response.ClockDriftSeverity ?? "unknown");

            return result.Connected && response.SerialMatches != false;
        }
        catch (CloudException exception)
        {
            // The device answered; DijiPeople did not. Worth saying plainly,
            // because the operator is standing in front of a working terminal.
            _logger.LogWarning(
                "Device {Device} answered, but the verification result could not be sent to DijiPeople: {Reason}",
                device.Name,
                exception.Message);
            return false;
        }
    }

    /// <summary>
    /// Reads the device's user directory and uploads it.
    ///
    /// Identity fields only, and no employee is ever created from a device user:
    /// mapping is a decision DijiPeople makes, and an exact-identifier one at
    /// that. A terminal is not an authoritative source of who works here.
    /// </summary>
    public async Task DiscoverUsersAsync(
        IntegrationConfiguration integration,
        DeviceConfiguration device,
        CancellationToken cancellationToken)
    {
        var connector = _connectors.Find(integration.ConnectorType);
        if (connector is null || !connector.Capabilities.Contains("READ_USERS"))
        {
            return;
        }

        var startedAt = DateTimeOffset.UtcNow;
        var stopwatch = Stopwatch.StartNew();

        var context = BuildContext(integration, device);
        var result = await connector.DiscoverUsersAsync(context, cancellationToken);
        stopwatch.Stop();

        if (!result.Succeeded)
        {
            await ReportRunAsync(
                integration,
                device,
                "USER_DISCOVERY",
                "FAILED",
                startedAt,
                stopwatch.ElapsedMilliseconds,
                new RunCounts(),
                result.ErrorCode,
                result.ErrorMessage,
                null,
                cancellationToken);
            return;
        }

        var counts = new RunCounts { RecordsRead = result.Users.Count };
        var status = "SUCCEEDED";
        string? errorCode = null;
        string? errorMessage = null;

        try
        {
            var response = await _cloud.UploadDiscoveredUsersAsync(
                new DiscoveredUsersRequest
                {
                    IntegrationId = integration.IntegrationId,
                    DeviceId = device.DeviceId,
                    Users = result.Users
                        .Select(user => new DiscoveredUserPayload
                        {
                            ExternalUserId = user.ExternalUserId,
                            Name = user.Name,
                            PrivilegeRaw = user.PrivilegeRaw,
                            Enabled = user.Enabled,
                        })
                        .ToList(),
                },
                cancellationToken);

            counts.RecordsNew = response.Recorded;
            counts.RecordsMapped = response.AutoMapped;
            counts.RecordsUnmapped = Math.Max(0, response.Recorded - response.AutoMapped);
            counts.RecordsFailed = response.Failed;

            _logger.LogInformation(
                "Discovered {Count} user(s) on {Device}; {Mapped} matched an employee automatically.",
                response.Recorded,
                device.Name,
                response.AutoMapped);
        }
        catch (CloudException exception)
        {
            // The read succeeded and the upload did not. PARTIAL says exactly
            // that, and discovery is cheap to repeat on the next cycle, so
            // nothing needs queueing.
            status = "PARTIAL";
            errorCode = exception.Kind.ToString().ToUpperInvariant();
            errorMessage = exception.Message;
        }

        await ReportRunAsync(
            integration,
            device,
            "USER_DISCOVERY",
            status,
            startedAt,
            stopwatch.ElapsedMilliseconds,
            counts,
            errorCode,
            errorMessage,
            null,
            cancellationToken);
    }

    /// <summary>
    /// One attendance cycle: read the terminal, fingerprint, queue, report.
    ///
    /// Uploading is NOT part of this. A read that succeeds is a success even
    /// when DijiPeople is unreachable, because the punches are already durable
    /// locally — coupling the two would mean an internet outage looked like a
    /// device failure and, worse, would tempt a design that dropped the punches
    /// with it.
    /// </summary>
    public async Task<SyncOutcome> SyncAttendanceAsync(
        IntegrationConfiguration integration,
        DeviceConfiguration device,
        DateTimeOffset? acknowledgesRequestAt,
        CancellationToken cancellationToken)
    {
        var connector = _connectors.Find(integration.ConnectorType);
        if (connector is null)
        {
            return SyncOutcome.Failed(
                "CONNECTOR_UNAVAILABLE",
                $"This gateway has no adapter for '{integration.ConnectorType}'.");
        }

        var startedAt = DateTimeOffset.UtcNow;
        var stopwatch = Stopwatch.StartNew();

        await _store.MarkSyncStartedAsync(device.DeviceId, startedAt, cancellationToken);

        var context = BuildContext(integration, device);
        var read = await connector.ReadAttendanceAsync(context, cancellationToken);
        stopwatch.Stop();

        if (!read.Succeeded)
        {
            await ReportRunAsync(
                integration,
                device,
                "ATTENDANCE_PULL",
                "FAILED",
                startedAt,
                stopwatch.ElapsedMilliseconds,
                new RunCounts(),
                read.ErrorCode,
                read.ErrorMessage,
                null,
                cancellationToken);

            return SyncOutcome.Failed(read.ErrorCode ?? "READ_FAILED", read.ErrorMessage);
        }

        var window = await ResolveWindowAsync(device, read.DeviceTimeLocal, cancellationToken);

        // The device's own timezone, never the gateway's. A terminal in another
        // zone would otherwise have every punch silently recorded at the wrong
        // moment, and a wrong timestamp is worse than an absent one because it
        // looks correct.
        var timezone = string.IsNullOrWhiteSpace(device.Timezone) ? null : device.Timezone;

        var outcome = await _store.ObserveAndEnqueueAsync(
            device.DeviceId,
            integration.IntegrationId,
            timezone,
            read.Punches,
            punch => window.Admits(punch.OccurredAtLocal),
            cancellationToken);

        await _store.MarkBaselineAsync(device.DeviceId, startedAt, cancellationToken);

        var counts = new RunCounts
        {
            RecordsRead = outcome.Read,
            RecordsNew = outcome.Queued,
            // A punch the gateway had already fingerprinted IS a duplicate, and
            // a cycle full of them is the normal steady state for a terminal
            // that re-reads its whole history every time. Not a failure.
            RecordsDuplicate = outcome.AlreadyKnown,
        };

        var status = "SUCCEEDED";
        string? errorCode = null;
        string? errorMessage = null;

        if (timezone is null)
        {
            // Loud, not silent, and not fatal. The punches are real and are kept
            // with no timezone attached; the configuration gap is reported so an
            // administrator can fix it and the events can be resolved to
            // instants downstream.
            status = "PARTIAL";
            errorCode = "DEVICE_TIMEZONE_MISSING";
            errorMessage =
                "No timezone is configured for this device, so its punches were stored as wall-clock times with no timezone.";
            _logger.LogWarning(
                "Device {Device} has no configured timezone. Punches are kept exactly as the terminal reported them; set a timezone so they can be placed in time.",
                device.Name);
        }

        _logger.LogInformation(
            "Synced {Device}: read {Read}, queued {Queued}, already known {Known}, outside import window {Skipped}, in {Duration} ms.",
            device.Name,
            outcome.Read,
            outcome.Queued,
            outcome.AlreadyKnown,
            outcome.SkippedOutsideWindow,
            stopwatch.ElapsedMilliseconds);

        await ReportRunAsync(
            integration,
            device,
            "ATTENDANCE_PULL",
            status,
            startedAt,
            stopwatch.ElapsedMilliseconds,
            counts,
            errorCode,
            errorMessage,
            acknowledgesRequestAt,
            cancellationToken);

        if (acknowledgesRequestAt is not null)
        {
            await _store.AcknowledgeSyncRequestAsync(
                device.DeviceId,
                acknowledgesRequestAt.Value,
                cancellationToken);
        }

        return SyncOutcome.Succeeded(outcome);
    }

    /// <summary>
    /// Loads the device's frozen import cutoff, computing it on first read.
    ///
    /// Stored under the device's own key so it survives restarts and
    /// reconfiguration. Recomputing it every cycle would make LAST_N_DAYS a
    /// sliding window that stops admitting yesterday's punches at midnight.
    /// </summary>
    private async Task<ImportWindow> ResolveWindowAsync(
        DeviceConfiguration device,
        string? deviceTimeLocal,
        CancellationToken cancellationToken)
    {
        var modeKey = $"device:{device.DeviceId}:importMode";
        var cutoffKey = $"device:{device.DeviceId}:importCutoff";

        var storedMode = _store.GetState(modeKey);
        if (storedMode is not null)
        {
            return ImportWindow.FromStoredCutoff(storedMode, _store.GetState(cutoffKey));
        }

        var window = ImportWindow.Resolve(
            device.Configuration,
            deviceTimeLocal,
            DateTimeOffset.Now);

        await _store.SetStateAsync(modeKey, window.Mode, cancellationToken);
        await _store.SetStateAsync(cutoffKey, window.CutoffLocal, cancellationToken);

        _logger.LogInformation(
            "Import window for {Device} set to {Mode}{Cutoff}. Older records on the terminal are recorded locally so they are never re-examined, and are left untouched on the device.",
            device.Name,
            window.Mode,
            window.CutoffLocal is null ? " (all history)" : $" from {window.CutoffLocal}");

        return window;
    }

    /// <summary>
    /// Device clock minus gateway clock, in seconds.
    ///
    /// Reported only. DijiPeople never sets a customer's terminal clock — the
    /// device is the customer's equipment, other software reads it, and silently
    /// changing its time would shift the meaning of every punch already on it.
    /// </summary>
    internal static int? ComputeClockDrift(string? deviceTimeLocal, DateTimeOffset gatewayNow)
    {
        if (string.IsNullOrWhiteSpace(deviceTimeLocal)) return null;

        if (!DateTime.TryParseExact(
                deviceTimeLocal,
                "yyyy-MM-dd'T'HH:mm:ss",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var deviceTime))
        {
            return null;
        }

        // Both sides are wall clock on machines expected to sit in the same
        // place. The terminal states no offset, so comparing against the
        // gateway's local wall clock is the only comparison the data supports.
        var difference = deviceTime - gatewayNow.LocalDateTime;
        return (int)Math.Round(difference.TotalSeconds);
    }

    private ConnectorDeviceContext BuildContext(
        IntegrationConfiguration integration,
        DeviceConfiguration device)
    {
        // Device settings win over the integration's. A site with two terminals
        // behind one integration needs per-device addresses, and the more
        // specific statement is the correct one.
        var configuration = new Dictionary<string, object?>(
            integration.Configuration,
            StringComparer.OrdinalIgnoreCase);

        foreach (var (key, value) in device.Configuration)
        {
            configuration[key] = value;
        }

        return new ConnectorDeviceContext
        {
            DeviceId = device.DeviceId,
            DeviceName = device.Name,
            IntegrationId = integration.IntegrationId,
            Host = device.Host ?? string.Empty,
            Port = device.Port ?? 4370,
            MachineNumber = device.MachineNumber ?? 1,
            ExpectedSerialNumber = device.ExpectedSerialNumber,
            Timezone = device.Timezone,
            Configuration = configuration,
            MaxRecords = MaxRecordsPerRead,
        };
    }

    /// <summary>
    /// Sends the run record.
    ///
    /// Best effort by design: a run that cannot be reported must not undo work
    /// that actually happened. The punches are already durable locally, and
    /// losing one telemetry row is a far smaller problem than treating a
    /// successful device read as a failure because the API was briefly down.
    /// </summary>
    private async Task ReportRunAsync(
        IntegrationConfiguration integration,
        DeviceConfiguration device,
        string runType,
        string status,
        DateTimeOffset startedAt,
        long durationMs,
        RunCounts counts,
        string? errorCode,
        string? errorMessage,
        DateTimeOffset? acknowledgesRequestAt,
        CancellationToken cancellationToken)
    {
        try
        {
            await _cloud.ReportRunAsync(
                new RunReportRequest
                {
                    IntegrationId = integration.IntegrationId,
                    DeviceId = device.DeviceId,
                    RunType = runType,
                    Status = status,
                    StartedAt = startedAt.ToString("O", CultureInfo.InvariantCulture),
                    CompletedAt = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture),
                    DurationMs = (int)Math.Min(durationMs, int.MaxValue),
                    RecordsRead = counts.RecordsRead,
                    RecordsNew = counts.RecordsNew,
                    RecordsDuplicate = counts.RecordsDuplicate,
                    RecordsMapped = counts.RecordsMapped,
                    RecordsUnmapped = counts.RecordsUnmapped,
                    RecordsFailed = counts.RecordsFailed,
                    ErrorCode = errorCode,
                    // The gateway's own bounded message. Connector internals and
                    // configuration values never travel in this field.
                    ErrorMessage = Truncate(errorMessage, 500),
                    AcknowledgesSyncRequestedAt =
                        acknowledgesRequestAt?.ToString("O", CultureInfo.InvariantCulture),
                },
                cancellationToken);
        }
        catch (CloudException exception)
        {
            _logger.LogWarning(
                "A {RunType} run for {Device} could not be recorded in DijiPeople: {Reason}",
                runType,
                device.Name,
                exception.Message);
        }
    }

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    public int FailureThreshold => OfflineAfterFailures;

    private sealed class RunCounts
    {
        public int RecordsRead { get; set; }
        public int RecordsNew { get; set; }
        public int RecordsDuplicate { get; set; }
        public int RecordsMapped { get; set; }
        public int RecordsUnmapped { get; set; }
        public int RecordsFailed { get; set; }
    }
}

public sealed record SyncOutcome(
    bool Success,
    EnqueueOutcome? Enqueued,
    string? ErrorCode,
    string? ErrorMessage)
{
    public static SyncOutcome Succeeded(EnqueueOutcome outcome) =>
        new(true, outcome, null, null);

    public static SyncOutcome Failed(string errorCode, string? errorMessage) =>
        new(false, null, errorCode, errorMessage);
}
