using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Configuration;
using DijiPeople.Gateway.Storage;

using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// Shared fixtures.
///
/// Every test gets its own temporary ProgramData root and its own SQLite file,
/// so nothing here can touch a real installation on the machine running the
/// suite — which matters, because the credential store writes to a well-known
/// machine path in production.
/// </summary>
internal sealed class TestEnvironment : IDisposable
{
    public TestEnvironment()
    {
        Root = Path.Combine(
            Path.GetTempPath(),
            "diji-gateway-tests",
            Guid.NewGuid().ToString("N"));

        Paths = new GatewayPaths(Root);
        Paths.EnsureCreated();

        Database = new GatewayDatabase(Paths.DatabaseFile, NullLogger<GatewayDatabase>.Instance);
        Database.Initialise();
        Store = new GatewayStore(Database);
    }

    public string Root { get; }
    public GatewayPaths Paths { get; }
    public GatewayDatabase Database { get; }
    public GatewayStore Store { get; }

    /// <summary>
    /// Reopens the database as a restart would, without touching the files.
    /// This is how the suite proves queue state survives a process death rather
    /// than merely surviving a method call.
    /// </summary>
    public (GatewayDatabase Database, GatewayStore Store) Restart()
    {
        Database.Dispose();
        var database = new GatewayDatabase(Paths.DatabaseFile, NullLogger<GatewayDatabase>.Instance);
        database.Initialise();
        return (database, new GatewayStore(database));
    }

    public void Dispose()
    {
        Database.Dispose();
        try
        {
            Directory.Delete(Root, recursive: true);
        }
        catch (IOException)
        {
            // A test-run leftover in the temp folder is not worth failing a suite.
        }
    }
}

internal static class TestLogger
{
    public static ILogger<T> For<T>() => NullLogger<T>.Instance;
}

/// <summary>
/// Locates the fake worker built alongside the test assembly.
/// </summary>
internal static class FakeWorker
{
    public static string Path
    {
        get
        {
            // The fake worker is a project reference built into its own output
            // folder; walk to it from the test binaries rather than hard-coding
            // a configuration name.
            var testBinaries = new DirectoryInfo(AppContext.BaseDirectory);
            var gatewayRoot = testBinaries;

            while (gatewayRoot is not null &&
                   !Directory.Exists(System.IO.Path.Combine(gatewayRoot.FullName, "tests")))
            {
                gatewayRoot = gatewayRoot.Parent;
            }

            if (gatewayRoot is null)
            {
                throw new InvalidOperationException("The gateway solution root could not be located.");
            }

            var candidates = Directory.GetFiles(
                System.IO.Path.Combine(gatewayRoot.FullName, "tests", "DijiPeople.Gateway.FakeWorker"),
                "DijiPeople.Gateway.FakeWorker.exe",
                SearchOption.AllDirectories);

            if (candidates.Length == 0)
            {
                throw new InvalidOperationException(
                    "The fake worker executable was not found. Build the solution before running the tests.");
            }

            return candidates[0];
        }
    }

    /// <summary>Sets the behaviour the next worker invocation will exhibit.</summary>
    public static IDisposable Mode(string mode, int punches = 0, string? deviceTime = null)
    {
        Environment.SetEnvironmentVariable("DIJI_FAKE_WORKER_MODE", mode);
        Environment.SetEnvironmentVariable(
            "DIJI_FAKE_WORKER_PUNCHES",
            punches.ToString(System.Globalization.CultureInfo.InvariantCulture));
        Environment.SetEnvironmentVariable("DIJI_FAKE_WORKER_DEVICE_TIME", deviceTime);

        return new Reset();
    }

    private sealed class Reset : IDisposable
    {
        public void Dispose()
        {
            Environment.SetEnvironmentVariable("DIJI_FAKE_WORKER_MODE", null);
            Environment.SetEnvironmentVariable("DIJI_FAKE_WORKER_PUNCHES", null);
            Environment.SetEnvironmentVariable("DIJI_FAKE_WORKER_DEVICE_TIME", null);
        }
    }
}

/// <summary>
/// A DijiPeople that can be made to fail in each way the real one can.
///
/// The failure modes are the reason this exists: an outage, a 500, a timeout and
/// a revoked credential each demand a different response from the gateway, and
/// none of them can be produced reliably against a real API.
/// </summary>
internal sealed class FakeCloudClient : ICloudClient
{
    public List<AttendanceBatchRequest> AttendanceBatches { get; } = new();
    public List<VerificationRequest> Verifications { get; } = new();
    public List<RunReportRequest> Runs { get; } = new();
    public List<DiscoveredUsersRequest> Discoveries { get; } = new();
    public List<HeartbeatRequest> Heartbeats { get; } = new();
    public List<ProvisioningResultRequest> ProvisioningResults { get; } = new();

    /// <summary>Set to make the next attendance upload fail this way.</summary>
    public CloudException? AttendanceFailure { get; set; }

    /// <summary>Fails the first N upload attempts, then succeeds. Models an outage.</summary>
    public int FailAttendanceTimes { get; set; }

    public GatewayConfiguration Configuration { get; set; } = new();
    public ClaimJobsResponse ClaimResponse { get; set; } = new();

    /// <summary>Every event id the cloud has "stored", to prove idempotency.</summary>
    public HashSet<string> StoredFingerprints { get; } = new(StringComparer.Ordinal);

    public Task<PairResponse> PairAsync(PairRequest request, CancellationToken cancellationToken) =>
        Task.FromResult(new PairResponse
        {
            GatewayId = "11111111-2222-3333-4444-555555555555",
            Credential = "dpgw_" + new string('a', 43),
            TokenPrefix = "dpgw_aaaaaaa",
        });

    public Task<HeartbeatResponse> HeartbeatAsync(
        HeartbeatRequest request,
        CancellationToken cancellationToken)
    {
        Heartbeats.Add(request);
        return Task.FromResult(new HeartbeatResponse
        {
            Status = "ONLINE",
            ServerTimeUtc = DateTimeOffset.UtcNow.ToString("O"),
        });
    }

    public Task<GatewayConfiguration> GetConfigurationAsync(CancellationToken cancellationToken) =>
        Task.FromResult(Configuration);

    public Task<AttendanceBatchResponse> UploadAttendanceAsync(
        AttendanceBatchRequest request,
        CancellationToken cancellationToken)
    {
        if (FailAttendanceTimes > 0)
        {
            FailAttendanceTimes--;
            throw AttendanceFailure ?? new CloudException(
                CloudFailureKind.Transient,
                "simulated outage");
        }

        if (AttendanceFailure is not null)
        {
            throw AttendanceFailure;
        }

        AttendanceBatches.Add(request);

        // Mirrors the real endpoint: the unique constraint absorbs repeats and
        // reports them as duplicates rather than errors.
        var inserted = 0;
        var duplicates = 0;
        foreach (var item in request.Events)
        {
            if (StoredFingerprints.Add($"{request.DeviceId}|{item.EventFingerprint}"))
            {
                inserted++;
            }
            else
            {
                duplicates++;
            }
        }

        return Task.FromResult(new AttendanceBatchResponse
        {
            Received = request.Events.Count,
            Inserted = inserted,
            Duplicates = duplicates,
        });
    }

    public Task<DiscoveredUsersResponse> UploadDiscoveredUsersAsync(
        DiscoveredUsersRequest request,
        CancellationToken cancellationToken)
    {
        Discoveries.Add(request);
        return Task.FromResult(new DiscoveredUsersResponse
        {
            Received = request.Users.Count,
            Recorded = request.Users.Count,
        });
    }

    public Task<VerificationResponse> ReportVerificationAsync(
        VerificationRequest request,
        CancellationToken cancellationToken)
    {
        Verifications.Add(request);
        return Task.FromResult(new VerificationResponse
        {
            DeviceId = request.DeviceId,
            VerificationStatus = request.Connected ? "VERIFIED" : "FAILED",
            HealthStatus = request.Connected ? "HEALTHY" : "UNREACHABLE",
            SerialMatches = request.Connected ? true : null,
            ClockDriftSeconds = request.ClockDriftSeconds,
            ClockDriftSeverity = "OK",
        });
    }

    public Task<RunReportResponse> ReportRunAsync(
        RunReportRequest request,
        CancellationToken cancellationToken)
    {
        Runs.Add(request);
        return Task.FromResult(new RunReportResponse
        {
            RunId = Guid.NewGuid().ToString(),
            Status = request.Status,
        });
    }

    public Task<ClaimJobsResponse> ClaimProvisioningJobsAsync(
        ClaimJobsRequest request,
        CancellationToken cancellationToken) => Task.FromResult(ClaimResponse);

    public Task<ProvisioningResultResponse> ReportProvisioningResultAsync(
        ProvisioningResultRequest request,
        CancellationToken cancellationToken)
    {
        ProvisioningResults.Add(request);
        return Task.FromResult(new ProvisioningResultResponse
        {
            JobId = request.JobId,
            Status = request.Succeeded ? "SUCCEEDED" : "FAILED",
        });
    }
}
