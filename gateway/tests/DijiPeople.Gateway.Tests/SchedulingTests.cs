using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Runtime;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// When devices are polled, and when they are deliberately not.
/// </summary>
public class SchedulingTests
{
    private static SyncPolicyConfiguration Policy(
        int intervalMinutes = 30,
        int jitterSeconds = 0,
        string mode = "POLL",
        string? windowStart = null,
        string? windowEnd = null) =>
        new()
        {
            Mode = mode,
            IntervalMinutes = intervalMinutes,
            JitterSeconds = jitterSeconds,
            ActiveWindowStart = windowStart,
            ActiveWindowEnd = windowEnd,
            RetryIntervalMinutes = 5,
            MaxRetries = 3,
        };

    private static readonly DateTimeOffset Now =
        new(2026, 8, 14, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ADeviceThatHasNeverSyncedIsDueImmediately()
    {
        Assert.True(SyncSchedule.IsDue(Policy(), null, null, "device-a", Now));
    }

    [Fact]
    public void ADeviceSyncedRecentlyIsNotDue()
    {
        Assert.False(SyncSchedule.IsDue(
            Policy(intervalMinutes: 30),
            Now.AddMinutes(-5),
            null,
            "device-a",
            Now));
    }

    [Fact]
    public void ADeviceBecomesDueOnceItsIntervalHasPassed()
    {
        Assert.True(SyncSchedule.IsDue(
            Policy(intervalMinutes: 30),
            Now.AddMinutes(-31),
            null,
            "device-a",
            Now));
    }

    [Fact]
    public void ManualPoliciesNeverBecomeDueOnTheirOwn()
    {
        // The whole meaning of MANUAL. An explicit request is handled separately.
        Assert.False(SyncSchedule.IsDue(
            Policy(mode: "MANUAL"),
            null,
            null,
            "device-a",
            Now));
    }

    [Fact]
    public void ARetryBackoffHoldsADeviceBackEvenWhenItsIntervalHasPassed()
    {
        Assert.False(SyncSchedule.IsDue(
            Policy(intervalMinutes: 30),
            Now.AddHours(-2),
            nextEligibleAt: Now.AddMinutes(5),
            "device-a",
            Now));
    }

    [Fact]
    public void JitterIsStableForADeviceAcrossRestarts()
    {
        // Randomising would reshuffle every device on every restart, which is
        // worst precisely when a site's gateways all reboot together.
        var first = SyncSchedule.JitterFor("device-a", 300);
        var second = SyncSchedule.JitterFor("device-a", 300);

        Assert.Equal(first, second);
        Assert.InRange(first.TotalSeconds, 0, 299);
    }

    [Fact]
    public void JitterSpreadsDifferentDevices()
    {
        var offsets = Enumerable.Range(0, 20)
            .Select(index => SyncSchedule.JitterFor($"device-{index}", 600).TotalSeconds)
            .Distinct()
            .Count();

        // Twenty terminals must not all wake on the same second.
        Assert.True(offsets > 10);
    }

    [Fact]
    public void JitterIsOffWhenThePolicyAsksForNone()
    {
        Assert.Equal(TimeSpan.Zero, SyncSchedule.JitterFor("device-a", 0));
    }

    [Fact]
    public void ADailyWindowKeepsPollingInsideIt()
    {
        var policy = Policy(windowStart: "06:00", windowEnd: "22:00");

        Assert.True(SyncSchedule.IsWithinActiveWindow(
            policy, new DateTimeOffset(2026, 8, 14, 9, 0, 0, TimeSpan.Zero).ToLocalTime()));
    }

    [Fact]
    public void AWindowThatWrapsMidnightIsANightShiftNotAMistake()
    {
        var policy = Policy(windowStart: "22:00", windowEnd: "06:00");

        var lateEvening = new DateTimeOffset(
            DateTime.SpecifyKind(new DateTime(2026, 8, 14, 23, 0, 0), DateTimeKind.Local));
        var earlyMorning = new DateTimeOffset(
            DateTime.SpecifyKind(new DateTime(2026, 8, 14, 3, 0, 0), DateTimeKind.Local));
        var afternoon = new DateTimeOffset(
            DateTime.SpecifyKind(new DateTime(2026, 8, 14, 14, 0, 0), DateTimeKind.Local));

        Assert.True(SyncSchedule.IsWithinActiveWindow(policy, lateEvening));
        Assert.True(SyncSchedule.IsWithinActiveWindow(policy, earlyMorning));
        Assert.False(SyncSchedule.IsWithinActiveWindow(policy, afternoon));
    }

    [Fact]
    public void AMalformedWindowDoesNotSilentlyStopCollection()
    {
        // Refusing to poll because a time string was mistyped would look like a
        // dead gateway and lose a day of attendance.
        var policy = Policy(windowStart: "not-a-time", windowEnd: "22:00");
        Assert.True(SyncSchedule.IsWithinActiveWindow(policy, Now));
    }

    [Fact]
    public void RetryDelayGrowsWithFailuresButNeverPastTheOrdinaryInterval()
    {
        var policy = Policy(intervalMinutes: 30);

        var first = SyncSchedule.NextRetryAt(policy, 1, Now);
        var later = SyncSchedule.NextRetryAt(policy, 5, Now);
        var extreme = SyncSchedule.NextRetryAt(policy, 100, Now);

        Assert.True(first < later);
        // A device that comes back should be picked up on its normal schedule,
        // not left waiting because it failed several times an hour ago.
        Assert.True(extreme <= Now.AddMinutes(30));
    }

    [Fact]
    public void ADeviceIsNotPolledOutsideItsWindowEvenWhenOverdue()
    {
        var policy = Policy(intervalMinutes: 30, windowStart: "06:00", windowEnd: "07:00");

        var afternoon = new DateTimeOffset(
            DateTime.SpecifyKind(new DateTime(2026, 8, 14, 15, 0, 0), DateTimeKind.Local));

        Assert.False(SyncSchedule.IsDue(
            policy, afternoon.AddHours(-5), null, "device-a", afternoon));
    }
}
