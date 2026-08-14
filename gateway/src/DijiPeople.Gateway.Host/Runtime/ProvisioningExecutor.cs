using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Storage;

using Microsoft.Extensions.Logging;

namespace DijiPeople.Gateway.Runtime;

/// <summary>
/// Claims and executes device provisioning jobs.
///
/// The transport is complete: claim under a server lease, execute through the
/// connector, report the result, release the lease. What it will not do is run
/// an uncertified write path. Three independent gates stand between a job row
/// and a customer's terminal:
///
///   1. the planner never creates jobs for an uncertified connector;
///   2. the API refuses to hand one out at claim time;
///   3. this executor checks the adapter's own capability set before calling it,
///      and the ZKTeco adapter refuses regardless.
///
/// Three gates for one rule is deliberate. Writing to a terminal the customer's
/// own V2011 software also manages, using SDK calls whose side effects have not
/// been established, is not something a single forgotten flag should be able to
/// unlock.
/// </summary>
public sealed class ProvisioningExecutor
{
    private readonly GatewayStore _store;
    private readonly ICloudClient _cloud;
    private readonly ConnectorRegistry _connectors;
    private readonly DeviceLockRegistry _locks;
    private readonly ILogger<ProvisioningExecutor> _logger;

    public ProvisioningExecutor(
        GatewayStore store,
        ICloudClient cloud,
        ConnectorRegistry connectors,
        DeviceLockRegistry locks,
        ILogger<ProvisioningExecutor> logger)
    {
        _store = store;
        _cloud = cloud;
        _connectors = connectors;
        _locks = locks;
        _logger = logger;
    }

    public async Task<int> ProcessAsync(
        GatewayConfiguration configuration,
        CancellationToken cancellationToken)
    {
        ClaimJobsResponse claim;
        try
        {
            claim = await _cloud.ClaimProvisioningJobsAsync(
                new ClaimJobsRequest { Limit = 10 },
                cancellationToken);
        }
        catch (CloudException exception)
        {
            _logger.LogDebug("No provisioning work could be claimed: {Reason}", exception.Message);
            return 0;
        }

        if (claim.Disabled || claim.Claimed.Count == 0)
        {
            if (claim.SkippedUncertified > 0)
            {
                _logger.LogInformation(
                    "{Count} provisioning job(s) are waiting on a connector whose write path is not certified.",
                    claim.SkippedUncertified);
            }
            return 0;
        }

        var executed = 0;

        foreach (var job in claim.Claimed)
        {
            cancellationToken.ThrowIfCancellationRequested();

            await _store.RecordJobClaimedAsync(
                job.JobId,
                job.Device.DeviceId,
                job.Operation,
                job.LeaseExpiresAt,
                cancellationToken);

            // A job this gateway already ran but could not report is reported,
            // not run again. Re-executing a write because an ACK was lost is
            // exactly the double-write the lease exists to prevent.
            if (_store.HasExecuted(job.JobId))
            {
                _logger.LogWarning(
                    "Provisioning job {Job} was already executed by this gateway; reporting the earlier outcome instead of repeating it.",
                    job.JobId);
                await ReportAsync(job, false, null, "ALREADY_EXECUTED",
                    "This job was executed previously and was not repeated.", cancellationToken);
                continue;
            }

            var result = await ExecuteAsync(job, configuration, cancellationToken);

            await _store.RecordJobExecutedAsync(
                job.JobId,
                result.Succeeded,
                result.ErrorCode,
                cancellationToken);

            await ReportAsync(
                job,
                result.Succeeded,
                result.ResultExternalUserId,
                result.ErrorCode,
                result.ErrorMessage,
                cancellationToken);

            executed++;
        }

        return executed;
    }

    private async Task<ProvisioningExecutionResult> ExecuteAsync(
        ProvisioningJob job,
        GatewayConfiguration configuration,
        CancellationToken cancellationToken)
    {
        var connector = _connectors.Find(job.ConnectorType);
        if (connector is null)
        {
            return new ProvisioningExecutionResult(
                false, null, "CONNECTOR_UNAVAILABLE",
                $"This gateway has no adapter for '{job.ConnectorType}'.");
        }

        // Assignment is checked BEFORE capability, because it is the security
        // question. A job naming a device this gateway does not serve must be
        // refused for that reason regardless of what the adapter can do — and
        // the refusal reason is what a support engineer reads.
        var integration = configuration.Integrations
            .FirstOrDefault(item => item.IntegrationId == job.IntegrationId);
        var device = integration?.Devices
            .FirstOrDefault(item => item.DeviceId == job.Device.DeviceId);

        if (integration is null || device is null)
        {
            // Refused rather than executed against the address in the job
            // payload. The gateway dials its own configuration, never a body.
            return new ProvisioningExecutionResult(
                false, null, "DEVICE_NOT_ASSIGNED",
                "This device is not part of this gateway's current configuration.");
        }

        var capability = job.Operation switch
        {
            "CREATE_USER" => "WRITE_USERS",
            "UPDATE_USER" => "UPDATE_USERS",
            _ => "DISABLE_USERS",
        };

        if (!connector.Capabilities.Contains(capability))
        {
            return new ProvisioningExecutionResult(
                false, null, "CAPABILITY_NOT_CERTIFIED",
                $"This gateway's '{job.ConnectorType}' adapter does not offer {capability}.");
        }

        // The same per-device lock the scheduler uses. A write must never run
        // while an attendance read holds the terminal's session.
        using var handle = _locks.TryAcquire(device.DeviceId);
        if (handle is null)
        {
            return new ProvisioningExecutionResult(
                false, null, "DEVICE_BUSY",
                "The device was busy with another operation.");
        }

        var context = new ConnectorDeviceContext
        {
            DeviceId = device.DeviceId,
            DeviceName = device.Name,
            IntegrationId = integration.IntegrationId,
            Host = device.Host ?? string.Empty,
            Port = device.Port ?? 4370,
            MachineNumber = device.MachineNumber ?? 1,
            ExpectedSerialNumber = device.ExpectedSerialNumber,
            Timezone = device.Timezone,
            Configuration = MergeConfiguration(integration, device),
        };

        return await connector.ProvisionUserAsync(
            context,
            job.Payload,
            job.Operation,
            cancellationToken);
    }

    private async Task ReportAsync(
        ProvisioningJob job,
        bool succeeded,
        string? resultExternalUserId,
        string? errorCode,
        string? errorMessage,
        CancellationToken cancellationToken)
    {
        try
        {
            await _cloud.ReportProvisioningResultAsync(
                new ProvisioningResultRequest
                {
                    JobId = job.JobId,
                    Succeeded = succeeded,
                    ResultExternalUserId = resultExternalUserId,
                    ErrorCode = errorCode,
                    ErrorMessage = errorMessage,
                },
                cancellationToken);

            await _store.RecordJobReportedAsync(job.JobId, cancellationToken);
        }
        catch (CloudException exception)
        {
            // The lease will lapse and the job becomes claimable again. Local
            // state records that it was already executed, so a re-claim reports
            // rather than repeats.
            _logger.LogWarning(
                "The outcome of provisioning job {Job} could not be reported: {Reason}",
                job.JobId,
                exception.Message);
        }
    }

    private static Dictionary<string, object?> MergeConfiguration(
        IntegrationConfiguration integration,
        DeviceConfiguration device)
    {
        var configuration = new Dictionary<string, object?>(
            integration.Configuration,
            StringComparer.OrdinalIgnoreCase);

        foreach (var (key, value) in device.Configuration)
        {
            configuration[key] = value;
        }

        return configuration;
    }
}
