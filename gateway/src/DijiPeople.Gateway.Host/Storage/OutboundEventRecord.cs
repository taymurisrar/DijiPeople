namespace DijiPeople.Gateway.Storage;

/// <summary>
/// Queue states.
///
/// DEAD_LETTER exists but is reached slowly and deliberately. Attendance is
/// payroll evidence; discarding it after a handful of failures would turn a
/// week-long API problem into permanently missing punches. A record only lands
/// here after the retry ceiling, and even then it is kept, not deleted.
/// </summary>
public static class OutboundEventState
{
    public const string Pending = "PENDING";
    public const string InFlight = "IN_FLIGHT";
    public const string Retry = "RETRY";
    public const string DeadLetter = "DEAD_LETTER";
    // ACKNOWLEDGED is not a stored state: an acknowledged row is deleted, so the
    // queue's size is always the real amount of outstanding work.
}

/// <summary>One queued punch, as held locally.</summary>
public sealed record OutboundEventRecord(
    long Id,
    string DeviceId,
    string IntegrationId,
    string Fingerprint,
    string ExternalUserId,
    string OccurredAtLocal,
    string? DeviceTimezone,
    int? VerificationModeRaw,
    int? PunchStateRaw,
    int? WorkCodeRaw,
    int AttemptCount);

/// <summary>A punch as read from a device, before any decision about sending it.</summary>
public sealed record ObservedPunch(
    string ExternalUserId,
    string OccurredAtLocal,
    int? VerificationModeRaw,
    int? PunchStateRaw,
    int? WorkCodeRaw,
    string Fingerprint);

/// <summary>Queue depth reported on heartbeat. Never the payloads themselves.</summary>
public sealed record QueueMetrics(
    int PendingCount,
    int DeadLetterCount,
    DateTimeOffset? OldestPendingAt,
    DateTimeOffset? LastSuccessfulUploadAt);

/// <summary>Local operational state for one device.</summary>
public sealed record DeviceRuntimeState(
    string DeviceId,
    string IntegrationId,
    DateTimeOffset? LastSyncCompletedAt,
    DateTimeOffset? LastSuccessfulSyncAt,
    int ConsecutiveFailures,
    string Health,
    DateTimeOffset? NextEligibleAt,
    DateTimeOffset? BaselineEstablishedAt,
    string? HighWaterOccurredAtLocal,
    DateTimeOffset? LastAcknowledgedSyncRequestAt);
