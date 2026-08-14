using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Connectors.ZkTeco;
using DijiPeople.Gateway.Runtime;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// The provisioning transport, and the gates that stop it writing to hardware
/// whose write path has not been validated.
/// </summary>
public class ProvisioningTests
{
    private const string DeviceId = "aaaaaaaa-1111-2222-3333-444444444444";
    private const string IntegrationId = "bbbbbbbb-1111-2222-3333-444444444444";

    private static (ProvisioningExecutor Executor, FakeCloudClient Cloud, DeviceLockRegistry Locks)
        Build(TestEnvironment environment)
    {
        var cloud = new FakeCloudClient();
        var locks = new DeviceLockRegistry();

        var registry = new ConnectorRegistry(new IGatewayAttendanceConnector[]
        {
            new ZkTecoLegacyConnector(
                new ZkTecoWorkerClient(
                    FakeWorker.Path,
                    TimeSpan.FromSeconds(10),
                    1024 * 1024,
                    TestLogger.For<ZkTecoWorkerClient>()),
                TestLogger.For<ZkTecoLegacyConnector>()),
        });

        return (
            new ProvisioningExecutor(
                environment.Store, cloud, registry, locks,
                TestLogger.For<ProvisioningExecutor>()),
            cloud,
            locks);
    }

    private static GatewayConfiguration Configuration() => new()
    {
        GatewayId = "11111111-2222-3333-4444-555555555555",
        Integrations = new List<IntegrationConfiguration>
        {
            new()
            {
                IntegrationId = IntegrationId,
                Name = "Terminals",
                ConnectorType = "zkteco-legacy-tcp",
                IsActive = true,
                Devices = new List<DeviceConfiguration>
                {
                    new()
                    {
                        DeviceId = DeviceId,
                        Name = "Front door",
                        Host = "192.168.18.53",
                        Port = 4370,
                        MachineNumber = 1,
                        IsEnabled = true,
                    },
                },
            },
        },
    };

    private static ProvisioningJob Job(string jobId = "job-1", string operation = "CREATE_USER") => new()
    {
        JobId = jobId,
        Operation = operation,
        LeaseExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15),
        Attempt = 1,
        MaxAttempts = 3,
        IntegrationId = IntegrationId,
        ConnectorType = "zkteco-legacy-tcp",
        Device = new ProvisioningJobDevice
        {
            DeviceId = DeviceId,
            Name = "Front door",
            Host = "192.168.18.53",
            Port = 4370,
            MachineNumber = 1,
        },
        Payload = new ProvisioningJobPayload
        {
            ExternalUserId = "99",
            EmployeeCode = "EMP0099",
            DisplayName = "Test Person",
            Enabled = true,
        },
    };

    [Fact]
    public async Task AnUncertifiedWritePathIsRefusedAndReportedHonestly()
    {
        using var environment = new TestEnvironment();
        var (executor, cloud, _) = Build(environment);

        cloud.ClaimResponse = new ClaimJobsResponse { Claimed = { Job() } };

        await executor.ProcessAsync(Configuration(), CancellationToken.None);

        var result = Assert.Single(cloud.ProvisioningResults);
        Assert.False(result.Succeeded);
        // Reported as an uncertified capability, not silently succeeded and not
        // silently swallowed.
        Assert.Equal("CAPABILITY_NOT_CERTIFIED", result.ErrorCode);
    }

    [Fact]
    public async Task AJobForADeviceThisGatewayDoesNotServeIsRefused()
    {
        using var environment = new TestEnvironment();
        var (executor, cloud, _) = Build(environment);

        var foreign = Job();
        foreign.Device.DeviceId = "dddddddd-9999-9999-9999-999999999999";
        cloud.ClaimResponse = new ClaimJobsResponse { Claimed = { foreign } };

        await executor.ProcessAsync(Configuration(), CancellationToken.None);

        var result = Assert.Single(cloud.ProvisioningResults);
        Assert.False(result.Succeeded);
        // The address in the job payload is NOT dialled just because a job
        // arrived naming it.
        Assert.Equal("DEVICE_NOT_ASSIGNED", result.ErrorCode);
    }

    [Fact]
    public async Task AJobAlreadyExecutedIsReportedRatherThanRepeated()
    {
        using var environment = new TestEnvironment();
        var (executor, cloud, _) = Build(environment);

        // The gateway executed this job and then failed to report it; the lease
        // lapsed and the same job came back.
        await environment.Store.RecordJobClaimedAsync("job-1", DeviceId, "CREATE_USER", null);
        await environment.Store.RecordJobExecutedAsync("job-1", succeeded: true, errorCode: null);

        cloud.ClaimResponse = new ClaimJobsResponse { Claimed = { Job() } };
        await executor.ProcessAsync(Configuration(), CancellationToken.None);

        var result = Assert.Single(cloud.ProvisioningResults);
        Assert.Equal("ALREADY_EXECUTED", result.ErrorCode);
    }

    [Fact]
    public async Task AJobDoesNotRunWhileTheDeviceIsBusyWithAnAttendanceRead()
    {
        using var environment = new TestEnvironment();
        var (executor, cloud, locks) = Build(environment);

        // A sync holds the device.
        using var held = locks.TryAcquire(DeviceId);
        Assert.NotNull(held);

        // A connector that DOES offer the capability, so the refusal being
        // tested is the lock and not the certification gate.
        var registry = new ConnectorRegistry(new IGatewayAttendanceConnector[]
        {
            new AlwaysWritableConnector(),
        });

        var writable = new ProvisioningExecutor(
            environment.Store, cloud, registry, locks, TestLogger.For<ProvisioningExecutor>());

        cloud.ClaimResponse = new ClaimJobsResponse { Claimed = { Job() } };
        await writable.ProcessAsync(Configuration(), CancellationToken.None);

        var result = Assert.Single(cloud.ProvisioningResults);
        Assert.Equal("DEVICE_BUSY", result.ErrorCode);
    }

    [Fact]
    public async Task NothingIsExecutedWhenTheTenantHasProvisioningSwitchedOff()
    {
        using var environment = new TestEnvironment();
        var (executor, cloud, _) = Build(environment);

        cloud.ClaimResponse = new ClaimJobsResponse { Disabled = true };

        var executed = await executor.ProcessAsync(Configuration(), CancellationToken.None);

        Assert.Equal(0, executed);
        Assert.Empty(cloud.ProvisioningResults);
    }

    /// <summary>
    /// A connector that would happily write, used only to isolate the lock and
    /// assignment checks from the ZKTeco certification refusal.
    /// </summary>
    private sealed class AlwaysWritableConnector : IGatewayAttendanceConnector
    {
        public string ConnectorType => "zkteco-legacy-tcp";

        public IReadOnlySet<string> Capabilities { get; } =
            new HashSet<string> { "WRITE_USERS", "UPDATE_USERS", "DISABLE_USERS" };

        public Task<DeviceVerificationResult> VerifyDeviceAsync(
            ConnectorDeviceContext context, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<UserDiscoveryResult> DiscoverUsersAsync(
            ConnectorDeviceContext context, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<AttendanceReadResult> ReadAttendanceAsync(
            ConnectorDeviceContext context, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<ProvisioningExecutionResult> ProvisionUserAsync(
            ConnectorDeviceContext context,
            ProvisioningJobPayload payload,
            string operation,
            CancellationToken cancellationToken) =>
            Task.FromResult(new ProvisioningExecutionResult(true, payload.ExternalUserId, null, null));
    }
}
