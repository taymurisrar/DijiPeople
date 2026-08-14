using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Storage;

using Microsoft.Extensions.Logging;

namespace DijiPeople.Gateway.Runtime;

/// <summary>
/// Drains the outbound queue into DijiPeople.
///
/// The single rule: a punch leaves the local queue only after DijiPeople has
/// answered successfully. Everything else follows from that — an outage holds
/// the queue, a restart re-sends whatever was in flight, and the cloud's unique
/// constraint absorbs the repeats.
///
/// DUPLICATES ARE SUCCESS. The ingestion endpoint reports how many rows it
/// skipped as already-present. That is the expected answer for a retried batch
/// and for a terminal re-read, and treating it as an error would put the queue
/// into a retry loop over records the cloud already holds.
/// </summary>
public sealed class UploadPump
{
    private readonly GatewayStore _store;
    private readonly ICloudClient _cloud;
    private readonly ILogger<UploadPump> _logger;

    /// <summary>
    /// Attempts before a record is parked as DEAD_LETTER.
    ///
    /// Deliberately high. With the capped exponential backoff this spans well
    /// over a day of continuous failure, which is the point: attendance is
    /// payroll evidence, and a long weekend outage must end with the punches
    /// uploaded rather than quietly abandoned.
    /// </summary>
    private const int MaxUploadAttempts = 25;

    public UploadPump(GatewayStore store, ICloudClient cloud, ILogger<UploadPump> logger)
    {
        _store = store;
        _cloud = cloud;
        _logger = logger;
    }

    /// <summary>True when the last pass hit an auth failure needing an operator.</summary>
    public bool CredentialRejected { get; private set; }

    public string? LastFailureReason { get; private set; }

    /// <summary>
    /// Uploads whatever is ready, in batches, until the queue is empty or a
    /// failure says to stop.
    ///
    /// <paramref name="maxBatches"/> bounds one pass so a large backlog cannot
    /// starve the heartbeat and the scheduler — the pump gives the loop back and
    /// picks up where it left off.
    /// </summary>
    public async Task<UploadPassResult> DrainAsync(
        int batchSize,
        int maxBatches,
        CancellationToken cancellationToken)
    {
        var uploaded = 0;
        var duplicates = 0;
        var batches = 0;

        for (; batches < maxBatches; batches++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var records = await _store.ClaimBatchAsync(batchSize, cancellationToken);
            if (records.Count == 0)
            {
                break;
            }

            var request = new AttendanceBatchRequest
            {
                IntegrationId = records[0].IntegrationId,
                DeviceId = records[0].DeviceId,
                Events = records
                    .Select(record => new AttendanceEventPayload
                    {
                        ExternalUserId = record.ExternalUserId,
                        // Sent exactly as the terminal reported it. No offset is
                        // appended anywhere on this path.
                        OccurredAtLocal = record.OccurredAtLocal,
                        VerificationModeRaw = record.VerificationModeRaw,
                        PunchStateRaw = record.PunchStateRaw,
                        WorkCodeRaw = record.WorkCodeRaw,
                        EventFingerprint = record.Fingerprint,
                        DeviceTimezone = record.DeviceTimezone,
                    })
                    .ToList(),
            };

            try
            {
                var response = await _cloud.UploadAttendanceAsync(request, cancellationToken);

                // Acknowledged only now, after the response. Doing this before
                // the call would lose the batch on any failure.
                await _store.AcknowledgeAsync(records, cancellationToken);

                uploaded += response.Inserted;
                duplicates += response.Duplicates;
                CredentialRejected = false;
                LastFailureReason = null;

                if (response.Invalid > 0 || response.Failed > 0)
                {
                    // The rows were still removed from the queue: re-sending
                    // something the server called invalid would loop forever.
                    // Reported loudly because it means a real data problem.
                    _logger.LogError(
                        "DijiPeople rejected {Invalid} invalid and {Failed} failed record(s) in a batch for device {Device}. They will not be re-sent.",
                        response.Invalid,
                        response.Failed,
                        request.DeviceId);
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Shutdown mid-batch. The rows stay IN_FLIGHT and start-up
                // returns them to PENDING, so nothing is lost.
                throw;
            }
            catch (CloudException exception)
            {
                await HandleFailureAsync(records, exception, cancellationToken);
                return new UploadPassResult(uploaded, duplicates, batches, Stopped: true);
            }
        }

        return new UploadPassResult(uploaded, duplicates, batches, Stopped: false);
    }

    private async Task HandleFailureAsync(
        IReadOnlyList<OutboundEventRecord> records,
        CloudException exception,
        CancellationToken cancellationToken)
    {
        LastFailureReason = exception.Message;

        switch (exception.Kind)
        {
            case CloudFailureKind.Unauthorized:
                // A revoked credential is not a transient condition and cannot be
                // retried out of. The records go back to PENDING with no attempt
                // charged against them — they did nothing wrong, and burning
                // their retry budget on an administrative problem would
                // eventually dead-letter perfectly good attendance data.
                CredentialRejected = true;
                await _store.FailAsync(records, "UNAUTHORIZED", int.MaxValue, cancellationToken);
                _logger.LogError(
                    "DijiPeople rejected this gateway's credential. Uploads are paused and {Count} record(s) are being held locally. An administrator must re-pair this gateway or rotate its credential.",
                    records.Count);
                break;

            case CloudFailureKind.Rejected:
                // The server understood the request and refused it. Repeating it
                // unchanged cannot help, so the backoff applies but the retry
                // budget does too.
                await _store.FailAsync(
                    records,
                    $"REJECTED_{exception.StatusCode}",
                    MaxUploadAttempts,
                    cancellationToken);
                _logger.LogError(
                    "DijiPeople refused an attendance batch: {Reason}",
                    exception.Message);
                break;

            default:
                await _store.FailAsync(
                    records,
                    exception.Kind == CloudFailureKind.ServerError ? "SERVER_ERROR" : "UNREACHABLE",
                    MaxUploadAttempts,
                    cancellationToken);
                _logger.LogWarning(
                    "{Count} attendance record(s) could not be uploaded and are held locally: {Reason}",
                    records.Count,
                    exception.Message);
                break;
        }
    }
}

public sealed record UploadPassResult(
    int Uploaded,
    int Duplicates,
    int Batches,
    bool Stopped);
