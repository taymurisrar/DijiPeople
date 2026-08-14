using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Runtime;
using DijiPeople.Gateway.Storage;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// The promise this suite exists to keep: a punch that has been read from a
/// terminal is never lost, and is never counted twice.
///
/// Every test here is a real failure a customer will hit — the internet drops,
/// Windows reboots mid-upload, the API returns 500 for an hour, the credential
/// is revoked. None of them may cost a single attendance record.
/// </summary>
public class QueueDurabilityTests
{
    private const string DeviceId = "aaaaaaaa-1111-2222-3333-444444444444";
    private const string IntegrationId = "bbbbbbbb-1111-2222-3333-444444444444";

    private static ObservedPunch Punch(string user, string occurredAt) =>
        new(user, occurredAt, 1, 0, 0,
            EventFingerprint.Compute("SERIAL", user, occurredAt, 1, 0, 0));

    private static async Task SeedAsync(TestEnvironment environment, params ObservedPunch[] punches)
    {
        await environment.Store.EnsureDeviceAsync(DeviceId, IntegrationId, "Front door");
        await environment.Store.ObserveAndEnqueueAsync(
            DeviceId,
            IntegrationId,
            "Asia/Karachi",
            punches,
            _ => true);
    }

    [Fact]
    public async Task ReadingTheSameHistoryTenTimesQueuesEachPunchOnce()
    {
        using var environment = new TestEnvironment();

        var history = new[]
        {
            Punch("1", "2026-08-14T09:00:00"),
            Punch("2", "2026-08-14T09:05:00"),
            Punch("3", "2026-08-14T09:10:00"),
        };

        await environment.Store.EnsureDeviceAsync(DeviceId, IntegrationId, "Front door");

        // A ZKTeco poll returns the device's entire history every time. Ten
        // polls is ten identical reads.
        for (var pass = 0; pass < 10; pass++)
        {
            var outcome = await environment.Store.ObserveAndEnqueueAsync(
                DeviceId, IntegrationId, "Asia/Karachi", history, _ => true);

            if (pass == 0)
            {
                Assert.Equal(3, outcome.Queued);
                Assert.Equal(0, outcome.AlreadyKnown);
            }
            else
            {
                Assert.Equal(0, outcome.Queued);
                Assert.Equal(3, outcome.AlreadyKnown);
            }
        }

        Assert.Equal(3, environment.Store.GetQueueMetrics().PendingCount);
    }

    [Fact]
    public async Task AnEventIsRemovedFromTheQueueOnlyAfterTheCloudAcknowledgesIt()
    {
        using var environment = new TestEnvironment();
        await SeedAsync(environment, Punch("1", "2026-08-14T09:00:00"));

        var claimed = await environment.Store.ClaimBatchAsync(500);
        Assert.Single(claimed);

        // Claimed but not acknowledged: still the gateway's responsibility.
        Assert.Equal(1, environment.Store.GetQueueMetrics().PendingCount);

        await environment.Store.AcknowledgeAsync(claimed);
        Assert.Equal(0, environment.Store.GetQueueMetrics().PendingCount);
    }

    [Fact]
    public async Task ARestartDuringAnUploadReturnsTheBatchToTheQueue()
    {
        using var environment = new TestEnvironment();
        await SeedAsync(
            environment,
            Punch("1", "2026-08-14T09:00:00"),
            Punch("2", "2026-08-14T09:01:00"));

        // Claimed and marked in flight, then the process dies — no acknowledge.
        var claimed = await environment.Store.ClaimBatchAsync(500);
        Assert.Equal(2, claimed.Count);

        var (database, store) = environment.Restart();
        using (database)
        {
            // Start-up recovery must offer them again rather than assume the
            // cloud got them. Re-sending is free; assuming is not.
            var again = await store.ClaimBatchAsync(500);
            Assert.Equal(2, again.Count);
        }
    }

    [Fact]
    public async Task TheQueueSurvivesARestartWithNothingInFlight()
    {
        using var environment = new TestEnvironment();
        await SeedAsync(
            environment,
            Punch("1", "2026-08-14T09:00:00"),
            Punch("2", "2026-08-14T09:01:00"),
            Punch("3", "2026-08-14T09:02:00"));

        var (database, store) = environment.Restart();
        using (database)
        {
            Assert.Equal(3, store.GetQueueMetrics().PendingCount);
        }
    }

    [Fact]
    public async Task AnInternetOutageHoldsEveryPunchAndUploadsThemWhenItReturns()
    {
        using var environment = new TestEnvironment();
        await SeedAsync(
            environment,
            Punch("1", "2026-08-14T09:00:00"),
            Punch("2", "2026-08-14T09:01:00"));

        var cloud = new FakeCloudClient
        {
            // Three failed passes before the connection comes back.
            FailAttendanceTimes = 3,
            AttendanceFailure = new CloudException(
                CloudFailureKind.Transient,
                "The network is unreachable."),
        };

        var pump = new UploadPump(environment.Store, cloud, TestLogger.For<UploadPump>());

        for (var attempt = 0; attempt < 3; attempt++)
        {
            var result = await pump.DrainAsync(500, 5, CancellationToken.None);
            Assert.True(result.Stopped);
            Assert.Equal(0, result.Uploaded);
            // Nothing was lost and nothing was delivered.
            Assert.Equal(2, environment.Store.GetQueueMetrics().PendingCount);

            // The backoff would normally delay the next attempt; the test clears
            // it so the sequence stays deterministic.
            await environment.Store.RequeueDeadLettersAsync();
            await ClearBackoffAsync(environment);
        }

        cloud.AttendanceFailure = null;
        var success = await pump.DrainAsync(500, 5, CancellationToken.None);

        Assert.Equal(2, success.Uploaded);
        Assert.Equal(0, environment.Store.GetQueueMetrics().PendingCount);
    }

    [Fact]
    public async Task RepeatedUploadsOfTheSameBatchLeaveOneRecordInTheCloud()
    {
        using var environment = new TestEnvironment();
        var cloud = new FakeCloudClient();
        var pump = new UploadPump(environment.Store, cloud, TestLogger.For<UploadPump>());

        var punch = Punch("1", "2026-08-14T09:00:00");

        // Five reads of the same device, each followed by an upload attempt.
        for (var pass = 0; pass < 5; pass++)
        {
            await SeedAsync(environment, punch);
            await pump.DrainAsync(500, 5, CancellationToken.None);
        }

        Assert.Single(cloud.StoredFingerprints);
    }

    [Fact]
    public async Task ARevokedCredentialStopsUploadingWithoutSpendingRetries()
    {
        using var environment = new TestEnvironment();
        await SeedAsync(environment, Punch("1", "2026-08-14T09:00:00"));

        var cloud = new FakeCloudClient
        {
            AttendanceFailure = new CloudException(
                CloudFailureKind.Unauthorized,
                "Gateway credential is not valid.",
                401),
        };

        var pump = new UploadPump(environment.Store, cloud, TestLogger.For<UploadPump>());
        var result = await pump.DrainAsync(500, 5, CancellationToken.None);

        Assert.True(result.Stopped);
        Assert.True(pump.CredentialRejected);

        // Held, not dead-lettered. An administrative problem must not consume a
        // record's retry budget and eventually discard real attendance data.
        var metrics = environment.Store.GetQueueMetrics();
        Assert.Equal(1, metrics.PendingCount);
        Assert.Equal(0, metrics.DeadLetterCount);
    }

    [Fact]
    public async Task AServerErrorRetriesRatherThanDiscarding()
    {
        using var environment = new TestEnvironment();
        await SeedAsync(environment, Punch("1", "2026-08-14T09:00:00"));

        var cloud = new FakeCloudClient
        {
            AttendanceFailure = new CloudException(
                CloudFailureKind.ServerError,
                "DijiPeople returned HTTP 500.",
                500),
        };

        var pump = new UploadPump(environment.Store, cloud, TestLogger.For<UploadPump>());
        await pump.DrainAsync(500, 5, CancellationToken.None);

        Assert.False(pump.CredentialRejected);
        var metrics = environment.Store.GetQueueMetrics();
        Assert.Equal(1, metrics.PendingCount);
        Assert.Equal(0, metrics.DeadLetterCount);
    }

    [Fact]
    public async Task DuplicatesReportedByTheCloudAreTreatedAsDelivered()
    {
        using var environment = new TestEnvironment();
        var cloud = new FakeCloudClient();

        // The cloud already holds this punch, as it would after a retry whose
        // response was lost.
        var punch = Punch("1", "2026-08-14T09:00:00");
        cloud.StoredFingerprints.Add($"{DeviceId}|{punch.Fingerprint}");

        await SeedAsync(environment, punch);

        var pump = new UploadPump(environment.Store, cloud, TestLogger.For<UploadPump>());
        var result = await pump.DrainAsync(500, 5, CancellationToken.None);

        Assert.Equal(1, result.Duplicates);
        Assert.False(result.Stopped);
        // Dequeued: the cloud holds it, which is the outcome that was wanted.
        Assert.Equal(0, environment.Store.GetQueueMetrics().PendingCount);
    }

    [Fact]
    public async Task LargeBacklogsAreUploadedInBoundedBatches()
    {
        using var environment = new TestEnvironment();

        var punches = Enumerable.Range(0, 1200)
            .Select(index => Punch(
                (index % 40).ToString(),
                $"2026-08-14T{(8 + (index / 60)) % 24:D2}:{index % 60:D2}:{index % 60:D2}"))
            .DistinctBy(punch => punch.Fingerprint)
            .ToArray();

        await SeedAsync(environment, punches);

        var cloud = new FakeCloudClient();
        var pump = new UploadPump(environment.Store, cloud, TestLogger.For<UploadPump>());

        await pump.DrainAsync(batchSize: 250, maxBatches: 50, CancellationToken.None);

        Assert.Equal(0, environment.Store.GetQueueMetrics().PendingCount);
        // One request per punch would be the obvious wrong implementation.
        Assert.True(cloud.AttendanceBatches.Count >= 4);
        Assert.All(cloud.AttendanceBatches, batch => Assert.True(batch.Events.Count <= 250));
    }

    [Fact]
    public void RetryBackoffGrowsAndThenStopsGrowing()
    {
        // A capped backoff is what lets a day-long outage still drain within
        // minutes of the API returning, instead of a doubling delay that has
        // reached days by then.
        Assert.Equal(TimeSpan.FromSeconds(30), GatewayStore.BackoffFor(1));
        Assert.Equal(TimeSpan.FromSeconds(60), GatewayStore.BackoffFor(2));
        Assert.Equal(TimeSpan.FromHours(1), GatewayStore.BackoffFor(20));
        Assert.Equal(TimeSpan.FromHours(1), GatewayStore.BackoffFor(200));
    }

    [Fact]
    public async Task QueueMetricsReportDepthAndAgeWithoutPayloads()
    {
        using var environment = new TestEnvironment();
        await SeedAsync(
            environment,
            Punch("1", "2026-08-14T09:00:00"),
            Punch("2", "2026-08-14T09:01:00"));

        var metrics = environment.Store.GetQueueMetrics();

        Assert.Equal(2, metrics.PendingCount);
        Assert.NotNull(metrics.OldestPendingAt);
        Assert.Null(metrics.LastSuccessfulUploadAt);
    }

    /// <summary>
    /// Clears the retry delay so an outage sequence runs deterministically. The
    /// backoff itself is covered separately.
    /// </summary>
    private static Task ClearBackoffAsync(TestEnvironment environment) =>
        environment.Database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText =
                "UPDATE OutboundEvent SET nextAttemptAt = NULL, state = 'PENDING';";
            command.ExecuteNonQuery();
        });
}
