using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Connectors.ZkTeco;
using DijiPeople.Gateway.Runtime;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// One device's sync, end to end, against a real worker process and a fake cloud.
/// </summary>
public class SyncRunnerTests
{
    private const string IntegrationId = "bbbbbbbb-1111-2222-3333-444444444444";

    private static (SyncRunner Runner, FakeCloudClient Cloud) Build(TestEnvironment environment)
    {
        var cloud = new FakeCloudClient();

        var registry = new ConnectorRegistry(new IGatewayAttendanceConnector[]
        {
            new ZkTecoLegacyConnector(
                new ZkTecoWorkerClient(
                    FakeWorker.Path,
                    TimeSpan.FromSeconds(30),
                    32 * 1024 * 1024,
                    TestLogger.For<ZkTecoWorkerClient>()),
                TestLogger.For<ZkTecoLegacyConnector>()),
        });

        return (
            new SyncRunner(environment.Store, cloud, registry, TestLogger.For<SyncRunner>()),
            cloud);
    }

    private static IntegrationConfiguration Integration(params DeviceConfiguration[] devices) =>
        new()
        {
            IntegrationId = IntegrationId,
            Name = "Head office terminals",
            Provider = "ZKTECO",
            ConnectorType = "zkteco-legacy-tcp",
            ConnectionMode = "LOCAL_GATEWAY",
            Status = "ACTIVE",
            IsActive = true,
            Configuration = new Dictionary<string, object?> { ["commKey"] = 0 },
            Devices = devices.ToList(),
        };

    private static DeviceConfiguration Device(
        string id,
        string? timezone = "Asia/Karachi",
        string mode = "ALL_HISTORY") =>
        new()
        {
            DeviceId = id,
            Name = $"Terminal {id[..4]}",
            ExpectedSerialNumber = "A2QO221160250",
            Host = "192.168.18.53",
            Port = 4370,
            MachineNumber = 1,
            Timezone = timezone,
            Status = "ACTIVE",
            IsEnabled = true,
            Configuration = new Dictionary<string, object?> { ["initialSyncMode"] = mode },
            SyncPolicy = new SyncPolicyConfiguration { IntervalMinutes = 30 },
            TimezoneMissing = timezone is null,
        };

    [Fact]
    public async Task ASuccessfulSyncQueuesPunchesAndRecordsTheRun()
    {
        using var environment = new TestEnvironment();
        using var _ = FakeWorker.Mode("attendance", deviceTime: "2026-08-14T12:00:00");

        var (runner, cloud) = Build(environment);
        var device = Device("aaaaaaaa-1111-2222-3333-444444444444");

        await environment.Store.EnsureDeviceAsync(device.DeviceId, IntegrationId, device.Name);

        var outcome = await runner.SyncAttendanceAsync(
            Integration(device), device, null, CancellationToken.None);

        Assert.True(outcome.Success);
        Assert.Equal(4, outcome.Enqueued!.Read);
        Assert.Equal(4, outcome.Enqueued.Queued);

        var run = Assert.Single(cloud.Runs);
        Assert.Equal("ATTENDANCE_PULL", run.RunType);
        Assert.Equal("SUCCEEDED", run.Status);
        Assert.Equal(4, run.RecordsNew);
    }

    [Fact]
    public async Task ACycleInWhichEveryPunchIsAlreadyKnownIsStillASuccess()
    {
        using var environment = new TestEnvironment();
        using var _ = FakeWorker.Mode("attendance", deviceTime: "2026-08-14T12:00:00");

        var (runner, cloud) = Build(environment);
        var device = Device("aaaaaaaa-1111-2222-3333-444444444444");
        var integration = Integration(device);

        await environment.Store.EnsureDeviceAsync(device.DeviceId, IntegrationId, device.Name);
        await runner.SyncAttendanceAsync(integration, device, null, CancellationToken.None);

        var second = await runner.SyncAttendanceAsync(
            integration, device, null, CancellationToken.None);

        Assert.True(second.Success);
        Assert.Equal(0, second.Enqueued!.Queued);
        Assert.Equal(4, second.Enqueued.AlreadyKnown);

        // Duplicates are the steady state for a terminal that re-reads its whole
        // history. Reporting them as failures would make a healthy site look
        // permanently broken.
        Assert.Equal("SUCCEEDED", cloud.Runs[^1].Status);
        Assert.Equal(4, cloud.Runs[^1].RecordsDuplicate);
    }

    [Fact]
    public async Task HistoryOutsideTheImportWindowIsFingerprintedButNotQueued()
    {
        using var environment = new TestEnvironment();
        using var _ = FakeWorker.Mode("attendance", deviceTime: "2026-08-14T12:00:00");

        var (runner, _) = Build(environment);
        // Default window: today onwards. The fixture holds punches from 2022 and
        // 2023 alongside today's.
        var device = Device("aaaaaaaa-1111-2222-3333-444444444444", mode: "CURRENT_DATE");

        await environment.Store.EnsureDeviceAsync(device.DeviceId, IntegrationId, device.Name);

        var outcome = await runner.SyncAttendanceAsync(
            Integration(device), device, null, CancellationToken.None);

        Assert.Equal(4, outcome.Enqueued!.Read);
        Assert.Equal(2, outcome.Enqueued.Queued);
        Assert.Equal(2, outcome.Enqueued.SkippedOutsideWindow);
        Assert.Equal(2, environment.Store.GetQueueMetrics().PendingCount);
    }

    [Fact]
    public async Task OldHistoryIsNotReconsideredOnEverySubsequentPoll()
    {
        using var environment = new TestEnvironment();
        using var _ = FakeWorker.Mode("attendance", deviceTime: "2026-08-14T12:00:00");

        var (runner, _) = Build(environment);
        var device = Device("aaaaaaaa-1111-2222-3333-444444444444", mode: "CURRENT_DATE");
        var integration = Integration(device);

        await environment.Store.EnsureDeviceAsync(device.DeviceId, IntegrationId, device.Name);
        await runner.SyncAttendanceAsync(integration, device, null, CancellationToken.None);

        var second = await runner.SyncAttendanceAsync(
            integration, device, null, CancellationToken.None);

        // The 2022/2023 records were fingerprinted on the first pass, so the
        // second recognises them rather than re-evaluating the window for them.
        Assert.Equal(0, second.Enqueued!.SkippedOutsideWindow);
        Assert.Equal(4, second.Enqueued.AlreadyKnown);
    }

    [Fact]
    public async Task AnUnreachableDeviceFailsItsOwnCycleAndNothingElse()
    {
        using var environment = new TestEnvironment();
        var (runner, cloud) = Build(environment);

        var offline = Device("aaaaaaaa-1111-2222-3333-444444444444");
        var healthy = Device("cccccccc-1111-2222-3333-444444444444");
        var integration = Integration(offline, healthy);

        await environment.Store.EnsureDeviceAsync(offline.DeviceId, IntegrationId, offline.Name);
        await environment.Store.EnsureDeviceAsync(healthy.DeviceId, IntegrationId, healthy.Name);

        SyncOutcome offlineOutcome;
        using (FakeWorker.Mode("device-unreachable"))
        {
            offlineOutcome = await runner.SyncAttendanceAsync(
                integration, offline, null, CancellationToken.None);
        }

        SyncOutcome healthyOutcome;
        using (FakeWorker.Mode("attendance", deviceTime: "2026-08-14T12:00:00"))
        {
            healthyOutcome = await runner.SyncAttendanceAsync(
                integration, healthy, null, CancellationToken.None);
        }

        Assert.False(offlineOutcome.Success);
        Assert.True(healthyOutcome.Success);

        Assert.Contains(cloud.Runs, run => run.Status == "FAILED");
        Assert.Contains(cloud.Runs, run => run.Status == "SUCCEEDED");
    }

    [Fact]
    public async Task ADeviceWithNoTimezoneIsSyncedButReportedAsPartial()
    {
        using var environment = new TestEnvironment();
        using var _ = FakeWorker.Mode("attendance", deviceTime: "2026-08-14T12:00:00");

        var (runner, cloud) = Build(environment);
        var device = Device("aaaaaaaa-1111-2222-3333-444444444444", timezone: null);

        await environment.Store.EnsureDeviceAsync(device.DeviceId, IntegrationId, device.Name);

        var outcome = await runner.SyncAttendanceAsync(
            Integration(device), device, null, CancellationToken.None);

        // The punches are real and are kept. What is NOT done is quietly
        // stamping them with the gateway machine's timezone, which would look
        // correct and be wrong.
        Assert.True(outcome.Success);
        Assert.Equal("PARTIAL", cloud.Runs[^1].Status);
        Assert.Equal("DEVICE_TIMEZONE_MISSING", cloud.Runs[^1].ErrorCode);

        var claimed = await environment.Store.ClaimBatchAsync(10);
        Assert.All(claimed, record => Assert.Null(record.DeviceTimezone));
    }

    [Fact]
    public async Task VerificationReportsTheTerminalIdentityToDijiPeople()
    {
        using var environment = new TestEnvironment();
        using var _ = FakeWorker.Mode("device-info", deviceTime: "2026-08-14T12:00:05");

        var (runner, cloud) = Build(environment);
        var device = Device("aaaaaaaa-1111-2222-3333-444444444444");

        await environment.Store.EnsureDeviceAsync(device.DeviceId, IntegrationId, device.Name);
        var verified = await runner.VerifyAsync(Integration(device), device, CancellationToken.None);

        Assert.True(verified);
        var report = Assert.Single(cloud.Verifications);
        Assert.True(report.Connected);
        Assert.Equal("A2QO221160250", report.ActualSerialNumber);
        Assert.Equal("2026-08-14T12:00:05", report.DeviceTimeLocal);
    }

    [Fact]
    public async Task DiscoveredUsersAreUploadedWithIdentityFieldsOnly()
    {
        using var environment = new TestEnvironment();
        using var _ = FakeWorker.Mode("users");

        var (runner, cloud) = Build(environment);
        var device = Device("aaaaaaaa-1111-2222-3333-444444444444");

        await environment.Store.EnsureDeviceAsync(device.DeviceId, IntegrationId, device.Name);
        await runner.DiscoverUsersAsync(Integration(device), device, CancellationToken.None);

        var upload = Assert.Single(cloud.Discoveries);
        Assert.Equal(2, upload.Users.Count);
        Assert.Equal(IntegrationId, upload.IntegrationId);
        Assert.Equal(device.DeviceId, upload.DeviceId);
    }

    [Theory]
    [InlineData("2026-08-14T12:00:00", "2026-08-14T12:00:00", 0)]
    [InlineData("2026-08-14T12:01:00", "2026-08-14T12:00:00", 60)]
    [InlineData("2026-08-14T11:55:00", "2026-08-14T12:00:00", -300)]
    public void ClockDriftIsTheDifferenceBetweenTheTwoWallClocks(
        string deviceTime,
        string gatewayTime,
        int expectedSeconds)
    {
        var gatewayNow = new DateTimeOffset(
            DateTime.SpecifyKind(DateTime.Parse(gatewayTime), DateTimeKind.Local));

        Assert.Equal(expectedSeconds, SyncRunner.ComputeClockDrift(deviceTime, gatewayNow));
    }

    [Fact]
    public void ADeviceThatReportsNoClockReportsNoDrift()
    {
        // Reported as unknown rather than as zero. Claiming a perfect clock for
        // a terminal that never stated one would hide a real problem.
        Assert.Null(SyncRunner.ComputeClockDrift(null, DateTimeOffset.Now));
        Assert.Null(SyncRunner.ComputeClockDrift("not a timestamp", DateTimeOffset.Now));
    }
}
