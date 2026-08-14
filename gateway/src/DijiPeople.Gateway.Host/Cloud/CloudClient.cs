using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

using DijiPeople.Gateway.Identity;

using Microsoft.Extensions.Logging;

namespace DijiPeople.Gateway.Cloud;

/// <summary>
/// The gateway's only outbound channel.
///
/// NETWORK SHAPE. Outbound HTTPS to DijiPeople and nothing else. The gateway
/// listens on no port, accepts no inbound connection, and nothing in DijiPeople's
/// cloud ever dials a customer's 192.168.x.x address — the LAN link to a
/// terminal exists only inside this machine's own process tree.
///
/// CREDENTIAL HANDLING. The credential is attached per request and read from the
/// protected store each time rather than held in a field, so revoking it locally
/// takes effect on the next call. It is never logged, never placed in a URL, and
/// never included in an exception message.
/// </summary>
public sealed class CloudClient : ICloudClient
{
    private readonly HttpClient _http;
    private readonly GatewayIdentityStore _identity;
    private readonly ILogger<CloudClient> _logger;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public CloudClient(
        HttpClient http,
        GatewayIdentityStore identity,
        ILogger<CloudClient> logger)
    {
        _http = http;
        _identity = identity;
        _logger = logger;
    }

    // Pairing is the one call with no credential — there isn't one yet. The code
    // is in the body rather than the URL so it cannot land in a proxy log.
    public Task<PairResponse> PairAsync(PairRequest request, CancellationToken cancellationToken) =>
        SendAsync<PairRequest, PairResponse>(
            HttpMethod.Post,
            "integrations/gateway/pair",
            request,
            authenticated: false,
            cancellationToken,
            validate: CloudResponseValidator.ValidatePairResponse);

    public Task<HeartbeatResponse> HeartbeatAsync(
        HeartbeatRequest request,
        CancellationToken cancellationToken) =>
        SendAsync<HeartbeatRequest, HeartbeatResponse>(
            HttpMethod.Post,
            "integrations/gateway/heartbeat",
            request,
            authenticated: true,
            cancellationToken);

    public async Task<GatewayConfiguration> GetConfigurationAsync(
        CancellationToken cancellationToken)
    {
        var configuration = await SendAsync<object, GatewayConfiguration>(
            HttpMethod.Get,
            "integrations/gateway/configuration",
            body: null,
            authenticated: true,
            cancellationToken);

        foreach (var problem in CloudResponseValidator.Sanitise(configuration))
        {
            // Reported, not swallowed: an administrator needs to know a device
            // was dropped, and the gateway keeps serving the rest.
            _logger.LogWarning("Configuration problem: {Problem}", problem);
        }

        return configuration;
    }

    public Task<AttendanceBatchResponse> UploadAttendanceAsync(
        AttendanceBatchRequest request,
        CancellationToken cancellationToken) =>
        SendAsync<AttendanceBatchRequest, AttendanceBatchResponse>(
            HttpMethod.Post,
            "integrations/gateway/attendance/events",
            request,
            authenticated: true,
            cancellationToken);

    public Task<DiscoveredUsersResponse> UploadDiscoveredUsersAsync(
        DiscoveredUsersRequest request,
        CancellationToken cancellationToken) =>
        SendAsync<DiscoveredUsersRequest, DiscoveredUsersResponse>(
            HttpMethod.Post,
            "integrations/gateway/devices/users",
            request,
            authenticated: true,
            cancellationToken);

    public Task<VerificationResponse> ReportVerificationAsync(
        VerificationRequest request,
        CancellationToken cancellationToken) =>
        SendAsync<VerificationRequest, VerificationResponse>(
            HttpMethod.Post,
            "integrations/gateway/devices/verification",
            request,
            authenticated: true,
            cancellationToken);

    public Task<RunReportResponse> ReportRunAsync(
        RunReportRequest request,
        CancellationToken cancellationToken) =>
        SendAsync<RunReportRequest, RunReportResponse>(
            HttpMethod.Post,
            "integrations/gateway/runs",
            request,
            authenticated: true,
            cancellationToken);

    public Task<ClaimJobsResponse> ClaimProvisioningJobsAsync(
        ClaimJobsRequest request,
        CancellationToken cancellationToken) =>
        SendAsync<ClaimJobsRequest, ClaimJobsResponse>(
            HttpMethod.Post,
            "integrations/gateway/provisioning/claim",
            request,
            authenticated: true,
            cancellationToken);

    public Task<ProvisioningResultResponse> ReportProvisioningResultAsync(
        ProvisioningResultRequest request,
        CancellationToken cancellationToken) =>
        SendAsync<ProvisioningResultRequest, ProvisioningResultResponse>(
            HttpMethod.Post,
            "integrations/gateway/provisioning/result",
            request,
            authenticated: true,
            cancellationToken);

    private async Task<TResponse> SendAsync<TRequest, TResponse>(
        HttpMethod method,
        string path,
        TRequest? body,
        bool authenticated,
        CancellationToken cancellationToken,
        Action<TResponse?>? validate = null)
        where TResponse : class
    {
        using var request = new HttpRequestMessage(method, path);

        if (body is not null)
        {
            request.Content = JsonContent.Create(body, options: Json);
        }

        if (authenticated)
        {
            var credential = _identity.ReadCredential();
            if (string.IsNullOrEmpty(credential))
            {
                // Deliberately the same failure kind as a server rejection: from
                // the caller's point of view "we have no usable credential" and
                // "the server refused our credential" need the same response —
                // stop, keep the data, ask for an administrator.
                throw new CloudException(
                    CloudFailureKind.Unauthorized,
                    "This gateway is not paired. Run the pairing step to connect it to DijiPeople.");
            }

            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credential);
        }

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The service is stopping. Not a cloud failure, and must not be
            // recorded as one.
            throw;
        }
        catch (Exception exception) when (
            exception is HttpRequestException or TaskCanceledException or IOException)
        {
            // Covers DNS failure, refused connection, TLS failure, cut cable and
            // request timeout. All mean the same thing: hold the data, try later.
            throw new CloudException(
                CloudFailureKind.Transient,
                $"DijiPeople could not be reached: {exception.Message}",
                innerException: exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw await ToFailureAsync(response, cancellationToken);
            }

            TResponse? parsed;
            try
            {
                parsed = await response.Content.ReadFromJsonAsync<TResponse>(
                    Json,
                    cancellationToken);
            }
            catch (Exception exception) when (exception is JsonException or NotSupportedException)
            {
                throw new CloudException(
                    CloudFailureKind.InvalidResponse,
                    "DijiPeople returned a response this gateway could not read.",
                    (int)response.StatusCode,
                    exception);
            }

            validate?.Invoke(parsed);

            if (parsed is null)
            {
                throw new CloudException(
                    CloudFailureKind.InvalidResponse,
                    "DijiPeople returned an empty response.",
                    (int)response.StatusCode);
            }

            return parsed;
        }
    }

    private static async Task<CloudException> ToFailureAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        var status = (int)response.StatusCode;

        var kind = response.StatusCode switch
        {
            HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden =>
                CloudFailureKind.Unauthorized,
            // 429 and 408 are the server asking for patience, not a bad request.
            HttpStatusCode.TooManyRequests or HttpStatusCode.RequestTimeout =>
                CloudFailureKind.Transient,
            >= HttpStatusCode.InternalServerError => CloudFailureKind.ServerError,
            _ => CloudFailureKind.Rejected,
        };

        var message = await ReadErrorMessageAsync(response, cancellationToken);

        return new CloudException(kind, message, status);
    }

    /// <summary>
    /// Extracts a readable message from an error body.
    ///
    /// Bounded and text-only: an error body is attacker-influenced input in the
    /// same way any response is, and it ends up in a log file a support engineer
    /// reads.
    /// </summary>
    private static async Task<string> ReadErrorMessageAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        try
        {
            var body = await response.Content.ReadFromJsonAsync<ApiErrorBody>(
                Json,
                cancellationToken);

            var message = body?.Message?.Value;
            if (!string.IsNullOrWhiteSpace(message))
            {
                return message.Length > 300 ? message[..300] : message;
            }
        }
        catch (Exception exception) when (
            exception is JsonException or NotSupportedException or HttpRequestException or IOException)
        {
            // Fall through to the status-only message below.
        }

        return $"DijiPeople returned HTTP {(int)response.StatusCode}.";
    }
}
