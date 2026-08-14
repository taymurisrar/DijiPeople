namespace DijiPeople.Gateway.Cloud;

/// <summary>
/// Everything the gateway asks of DijiPeople.
///
/// An interface rather than a concrete class so the scheduler, uploader and
/// health logic can be tested against an outage, a 500, a timeout and a revoked
/// credential without a network — those are the paths that must not lose a
/// punch, and they are the hardest to reproduce against a real API.
/// </summary>
public interface ICloudClient
{
    /// <summary>Redeems a one-time pairing code. The only unauthenticated call.</summary>
    Task<PairResponse> PairAsync(PairRequest request, CancellationToken cancellationToken);

    Task<HeartbeatResponse> HeartbeatAsync(
        HeartbeatRequest request,
        CancellationToken cancellationToken);

    /// <summary>The integrations and devices this gateway is assigned.</summary>
    Task<GatewayConfiguration> GetConfigurationAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Uploads a batch of punches. Duplicates in the response are a success, not
    /// an error: the cloud's unique constraint is the authoritative dedupe, and
    /// a retried batch is expected to report them.
    /// </summary>
    Task<AttendanceBatchResponse> UploadAttendanceAsync(
        AttendanceBatchRequest request,
        CancellationToken cancellationToken);

    Task<DiscoveredUsersResponse> UploadDiscoveredUsersAsync(
        DiscoveredUsersRequest request,
        CancellationToken cancellationToken);

    Task<VerificationResponse> ReportVerificationAsync(
        VerificationRequest request,
        CancellationToken cancellationToken);

    Task<RunReportResponse> ReportRunAsync(
        RunReportRequest request,
        CancellationToken cancellationToken);

    Task<ClaimJobsResponse> ClaimProvisioningJobsAsync(
        ClaimJobsRequest request,
        CancellationToken cancellationToken);

    Task<ProvisioningResultResponse> ReportProvisioningResultAsync(
        ProvisioningResultRequest request,
        CancellationToken cancellationToken);
}
