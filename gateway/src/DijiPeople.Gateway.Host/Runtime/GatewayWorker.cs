using System.Globalization;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Configuration;
using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Identity;
using DijiPeople.Gateway.Storage;

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace DijiPeople.Gateway.Runtime;

/// <summary>
/// The service loop.
///
/// One loop, one second at a time, driving four independent cadences: heartbeat,
/// configuration refresh, device scheduling and queue drain. A single loop
/// rather than four timers because they interact — a revoked credential must
/// stop uploads and provisioning but not device reads, and a configuration
/// refresh must be visible to the next scheduling decision, not the one after.
///
/// NOTHING HERE FAILS THE SERVICE. Every cadence catches its own failures and
/// records health. The gateway staying up while a device, the network or the API
/// is down is the entire reason it exists: a service that exits on an outage
/// stops collecting the punches the outage was supposed to be survivable for.
/// </summary>
public sealed class GatewayWorker : BackgroundService
{
    private readonly GatewaySettings _settings;
    private readonly GatewayIdentityStore _identityStore;
    private readonly GatewayStore _store;
    private readonly ICloudClient _cloud;
    private readonly ConnectorRegistry _connectors;
    private readonly SyncRunner _syncRunner;
    private readonly UploadPump _uploadPump;
    private readonly ProvisioningExecutor _provisioning;
    private readonly DeviceLockRegistry _locks;
    private readonly ILogger<GatewayWorker> _logger;

    private GatewayConfiguration? _configuration;
    private DateTimeOffset _lastHeartbeatAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastConfigRefreshAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastProvisioningPollAt = DateTimeOffset.MinValue;

    /// <summary>
    /// How long to wait between attempts once DijiPeople has rejected the
    /// credential. Long, because no amount of retrying fixes a revoked
    /// credential — only an administrator does — and a tight loop against an
    /// endpoint that is refusing us is exactly the behaviour a rate limiter is
    /// designed to punish. It is not infinite so that a rotation performed in
    /// the web app is picked up without a service restart.
    /// </summary>
    private static readonly TimeSpan UnauthorizedBackoff = TimeSpan.FromMinutes(15);

    private DateTimeOffset _unauthorizedUntil = DateTimeOffset.MinValue;

    private static readonly TimeSpan ProvisioningPollInterval = TimeSpan.FromMinutes(2);

    /// <summary>Batches per pass, so a backlog cannot starve the other cadences.</summary>
    private const int MaxBatchesPerPass = 20;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public GatewayWorker(
        GatewaySettings settings,
        GatewayIdentityStore identityStore,
        GatewayStore store,
        ICloudClient cloud,
        ConnectorRegistry connectors,
        SyncRunner syncRunner,
        UploadPump uploadPump,
        ProvisioningExecutor provisioning,
        DeviceLockRegistry locks,
        ILogger<GatewayWorker> logger)
    {
        _settings = settings;
        _identityStore = identityStore;
        _store = store;
        _cloud = cloud;
        _connectors = connectors;
        _syncRunner = syncRunner;
        _uploadPump = uploadPump;
        _provisioning = provisioning;
        _locks = locks;
        _logger = logger;
    }

    public static string Version =>
        Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

    public static string Architecture => RuntimeInformation.ProcessArchitecture.ToString();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var identity = _identityStore.ReadIdentity();

        _logger.LogInformation(
            "DijiPeople Integration Gateway {Version} ({Architecture}) starting. Connectors: {Connectors}.",
            Version,
            Architecture,
            string.Join(", ", _connectors.SupportedConnectorTypes));

        if (identity is null || !_identityStore.IsPaired)
        {
            // Not an error and not a reason to exit. The service is installed and
            // running; it is simply waiting for an administrator to pair it, and
            // it will pick that up without a restart.
            _logger.LogWarning(
                "This gateway is not paired yet. Run 'DijiPeople.Gateway.exe pair --code <PAIRING-CODE>' as an administrator to connect it to DijiPeople.");
        }
        else
        {
            _logger.LogInformation(
                "Paired as gateway {GatewayId} against {CloudBaseUrl}.",
                identity.GatewayId,
                identity.CloudBaseUrl);

            RestoreCachedConfiguration();
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // The backstop. Whatever went wrong, the service keeps running:
                // stopping would mean a customer's terminals go uncollected until
                // someone notices a stopped Windows service.
                _logger.LogError(
                    exception,
                    "An unexpected error interrupted a gateway cycle. The service is continuing.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation(
            "Gateway stopping. {Pending} attendance record(s) are held locally and will be uploaded when it starts again.",
            _store.GetQueueMetrics().PendingCount);
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        if (!_identityStore.IsPaired)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;

        if (now < _unauthorizedUntil)
        {
            // Credential rejected recently. Device reads are deliberately still
            // allowed below: the punches are worth collecting even when they
            // cannot be uploaded yet, and they wait in the durable queue.
            await RunDeviceCyclesAsync(cancellationToken);
            return;
        }

        var policy = _configuration?.Policy ?? new GatewayRuntimePolicy();

        if (now - _lastConfigRefreshAt >= TimeSpan.FromSeconds(policy.ConfigRefreshSeconds))
        {
            await RefreshConfigurationAsync(cancellationToken);
            _lastConfigRefreshAt = now;
        }

        await RunDeviceCyclesAsync(cancellationToken);

        await DrainQueueAsync(cancellationToken);

        if (now - _lastHeartbeatAt >= TimeSpan.FromSeconds(policy.HeartbeatIntervalSeconds))
        {
            await SendHeartbeatAsync(cancellationToken);
            _lastHeartbeatAt = now;
        }

        if (now - _lastProvisioningPollAt >= ProvisioningPollInterval && _configuration is not null)
        {
            await _provisioning.ProcessAsync(_configuration, cancellationToken);
            _lastProvisioningPollAt = now;
        }
    }

    // ------------------------------------------------------------ configuration

    /// <summary>
    /// Loads the last configuration DijiPeople sent.
    ///
    /// Lets a gateway that restarts during a cloud outage keep polling its
    /// devices instead of sitting idle until the API comes back. The cached copy
    /// is replaced the moment a fresh one arrives.
    /// </summary>
    private void RestoreCachedConfiguration()
    {
        var cached = _store.GetCachedConfiguration();
        if (cached is null) return;

        try
        {
            var configuration = JsonSerializer.Deserialize<GatewayConfiguration>(
                cached.Value.Payload,
                Json);

            if (configuration is null) return;

            // Re-validated on the way back in. A cache file is local state and
            // gets the same scrutiny as a fresh response.
            CloudResponseValidator.Sanitise(configuration);
            _configuration = configuration;

            _logger.LogInformation(
                "Using the last configuration received from DijiPeople ({Version}) until a fresh one arrives.",
                cached.Value.ConfigVersion);
        }
        catch (Exception exception) when (exception is JsonException or CloudException)
        {
            _logger.LogWarning("The cached configuration could not be used and was ignored.");
        }
    }

    private async Task RefreshConfigurationAsync(CancellationToken cancellationToken)
    {
        try
        {
            var configuration = await _cloud.GetConfigurationAsync(cancellationToken);
            var changed = _configuration?.ConfigVersion != configuration.ConfigVersion;

            _configuration = configuration;
            _unauthorizedUntil = DateTimeOffset.MinValue;

            // The cache carries decrypted connector secrets, so it lives in the
            // same protected data folder as the rest of the gateway's state and
            // never in a log or a diagnostics bundle.
            await _store.CacheConfigurationAsync(
                configuration.ConfigVersion,
                JsonSerializer.Serialize(configuration, Json),
                cancellationToken);

            foreach (var integration in configuration.Integrations)
            {
                foreach (var device in integration.Devices)
                {
                    await _store.EnsureDeviceAsync(
                        device.DeviceId,
                        integration.IntegrationId,
                        device.Name,
                        cancellationToken);
                }
            }

            if (changed)
            {
                _logger.LogInformation(
                    "Configuration updated ({Version}): {Integrations} integration(s), {Devices} device(s).",
                    configuration.ConfigVersion,
                    configuration.Integrations.Count,
                    configuration.Integrations.Sum(item => item.Devices.Count));
            }
        }
        catch (CloudException exception)
        {
            HandleCloudFailure(exception, "configuration refresh");
        }
    }

    // ---------------------------------------------------------------- devices

    private async Task RunDeviceCyclesAsync(CancellationToken cancellationToken)
    {
        if (_configuration is null) return;

        if (!_configuration.Policy.IntegrationEnabled)
        {
            // The tenant's master switch is off. Nothing is polled and nothing
            // is written; existing queued punches are still uploaded, because
            // they were collected while it was on.
            return;
        }

        var now = DateTimeOffset.UtcNow;

        foreach (var integration in _configuration.Integrations)
        {
            if (!integration.IsActive) continue;

            foreach (var device in integration.Devices)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (!device.IsEnabled)
                {
                    // Disabled in DijiPeople. Polling stops; the local history and
                    // anything already queued for it are kept for audit.
                    continue;
                }

                if (_locks.BusyCount >= _settings.MaxConcurrentDeviceSyncs &&
                    !_locks.IsBusy(device.DeviceId))
                {
                    continue;
                }

                var state = _store.GetDeviceState(device.DeviceId);
                var policy = device.SyncPolicy ?? new SyncPolicyConfiguration();

                var manualRequest = PendingManualRequest(device, state);
                var due = manualRequest is not null || SyncSchedule.IsDue(
                    policy,
                    state?.LastSyncCompletedAt,
                    state?.NextEligibleAt,
                    device.DeviceId,
                    now);

                if (!due) continue;

                // Coalesced, not queued: a second request while a device is
                // already syncing would run the identical full-history read for
                // nothing and risk a concurrent COM session.
                using var handle = _locks.TryAcquire(device.DeviceId);
                if (handle is null) continue;

                await RunOneDeviceAsync(
                    integration,
                    device,
                    policy,
                    state,
                    manualRequest,
                    cancellationToken);
            }
        }
    }

    /// <summary>
    /// An outstanding manual request the gateway has not answered yet.
    ///
    /// Compared against what this gateway last acknowledged rather than a flag
    /// the server clears: a request made while a sync was already in flight must
    /// still be honoured afterwards, not swallowed by the run that was already
    /// running when the operator clicked.
    /// </summary>
    private static DateTimeOffset? PendingManualRequest(
        DeviceConfiguration device,
        DeviceRuntimeState? state)
    {
        if (device.SyncRequestedAt is null) return null;

        var acknowledged = state?.LastAcknowledgedSyncRequestAt;
        return acknowledged is null || acknowledged < device.SyncRequestedAt
            ? device.SyncRequestedAt
            : null;
    }

    private async Task RunOneDeviceAsync(
        IntegrationConfiguration integration,
        DeviceConfiguration device,
        SyncPolicyConfiguration policy,
        DeviceRuntimeState? state,
        DateTimeOffset? manualRequest,
        CancellationToken cancellationToken)
    {
        try
        {
            // Verify before reading in two cases: first contact, so "the wrong
            // terminal answered" is caught by an identity check rather than by a
            // pile of punches attributed to the wrong site; and whenever an
            // administrator asked for this sync, because someone pressing the
            // button is usually checking whether the device is reachable at all
            // and deserves a fresh answer rather than a stale one.
            var neverVerified = state?.LastSuccessfulSyncAt is null &&
                !string.Equals(device.VerificationStatus, "VERIFIED", StringComparison.Ordinal);

            if (neverVerified || manualRequest is not null)
            {
                await _syncRunner.VerifyAsync(integration, device, cancellationToken);
            }

            var outcome = await _syncRunner.SyncAttendanceAsync(
                integration,
                device,
                manualRequest,
                cancellationToken);

            var completedAt = DateTimeOffset.UtcNow;
            var failures = state?.ConsecutiveFailures ?? 0;

            await _store.RecordSyncOutcomeAsync(
                device.DeviceId,
                outcome.Success,
                outcome.ErrorCode,
                completedAt,
                outcome.Success
                    ? completedAt.AddMinutes(policy.IntervalMinutes)
                    : SyncSchedule.NextRetryAt(policy, failures + 1, completedAt),
                _syncRunner.FailureThreshold,
                cancellationToken);

            if (!outcome.Success)
            {
                _logger.LogWarning(
                    "Device {Device} could not be read ({Code}). The gateway and its other devices are unaffected.",
                    device.Name,
                    outcome.ErrorCode);
            }
            else if (state?.LastSuccessfulSyncAt is null)
            {
                // Directory discovery on first success only. Re-reading it every
                // cycle would add a second full COM session per poll for data
                // that changes when someone is enrolled, not every half hour.
                await _syncRunner.DiscoverUsersAsync(integration, device, cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            // One device's unexpected failure, contained. The service, the other
            // devices and the queue are untouched.
            _logger.LogError(
                exception,
                "Device {Device} failed unexpectedly. The gateway is continuing with its other devices.",
                device.Name);

            var completedAt = DateTimeOffset.UtcNow;
            await _store.RecordSyncOutcomeAsync(
                device.DeviceId,
                succeeded: false,
                errorCode: "UNEXPECTED_ERROR",
                completedAt,
                SyncSchedule.NextRetryAt(policy, (state?.ConsecutiveFailures ?? 0) + 1, completedAt),
                _syncRunner.FailureThreshold,
                cancellationToken);
        }
    }

    // ------------------------------------------------------------------ queue

    private async Task DrainQueueAsync(CancellationToken cancellationToken)
    {
        var batchSize = _configuration?.Policy.UploadBatchSize ?? 500;

        var result = await _uploadPump.DrainAsync(
            batchSize,
            MaxBatchesPerPass,
            cancellationToken);

        if (_uploadPump.CredentialRejected)
        {
            _unauthorizedUntil = DateTimeOffset.UtcNow.Add(UnauthorizedBackoff);
        }

        if (result.Uploaded > 0 || result.Duplicates > 0)
        {
            _logger.LogInformation(
                "Uploaded {Uploaded} new and {Duplicates} already-known attendance record(s).",
                result.Uploaded,
                result.Duplicates);
        }
    }

    // -------------------------------------------------------------- heartbeat

    private async Task SendHeartbeatAsync(CancellationToken cancellationToken)
    {
        var metrics = _store.GetQueueMetrics();
        var health = _store.GetDeviceHealth();
        var identity = _identityStore.ReadIdentity();

        var online = health.Count(entry => entry.Value == "ONLINE");
        var unreachable = health.Count(entry =>
            entry.Value is "OFFLINE" or "ERROR");

        // Reported, but the server decides status. A gateway cannot declare
        // itself healthy; it can only say what it observes.
        var degraded = metrics.DeadLetterCount > 0 || _uploadPump.CredentialRejected;

        try
        {
            await _cloud.HeartbeatAsync(
                new HeartbeatRequest
                {
                    Version = Version,
                    Platform = "WINDOWS",
                    Architecture = Architecture,
                    Capabilities = _connectors.DescribeCapabilities(),
                    LocalTimestamp = DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture),
                    DevicesOnline = online,
                    DevicesUnreachable = unreachable,
                    // Depth and age only. The queued punches themselves go
                    // through the ingestion endpoint or not at all.
                    PendingQueueCount = metrics.PendingCount,
                    OldestPendingEventAt =
                        metrics.OldestPendingAt?.ToString("O", CultureInfo.InvariantCulture),
                    LastSuccessfulUploadAt =
                        metrics.LastSuccessfulUploadAt?.ToString("O", CultureInfo.InvariantCulture),
                    InstallationId = identity?.InstallationId,
                    Degraded = degraded,
                },
                cancellationToken);
        }
        catch (CloudException exception)
        {
            HandleCloudFailure(exception, "heartbeat");
        }
    }

    /// <summary>
    /// Turns a cloud failure into the right operational response.
    ///
    /// The important distinction: a transient failure is logged quietly and
    /// retried, while a rejected credential stops privileged calls and says
    /// plainly that a human is needed. Treating them the same would either spam
    /// the log through every outage or leave a revoked gateway retrying silently
    /// forever.
    /// </summary>
    private void HandleCloudFailure(CloudException exception, string operation)
    {
        if (exception.Kind == CloudFailureKind.Unauthorized)
        {
            _unauthorizedUntil = DateTimeOffset.UtcNow.Add(UnauthorizedBackoff);
            _logger.LogError(
                "DijiPeople rejected this gateway's credential during {Operation}. Device data is being kept locally. An administrator must re-pair this gateway or rotate its credential in Settings.",
                operation);
            return;
        }

        _logger.LogWarning(
            "The {Operation} could not reach DijiPeople: {Reason}. Local data is unaffected and this will be retried.",
            operation,
            exception.Message);
    }
}
