using DijiPeople.Gateway.Runtime;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// Which of a terminal's stored punches are admitted into DijiPeople.
///
/// This is the difference between a customer going live with today's attendance
/// and a customer going live with four years of it. The device holds the same
/// records either way; only what DijiPeople accepts changes.
/// </summary>
public class ImportWindowTests
{
    private static readonly DateTimeOffset GatewayNow =
        new(2026, 8, 14, 12, 0, 0, TimeSpan.Zero);

    private const string DeviceTime = "2026-08-14T12:00:00";

    [Fact]
    public void TheDefaultAdmitsOnlyTodayOnwards()
    {
        // No configuration at all. The conservative choice must be the default,
        // because the destructive option here is the accidental one.
        var window = ImportWindow.Resolve(
            new Dictionary<string, object?>(),
            DeviceTime,
            GatewayNow);

        Assert.Equal("CURRENT_DATE", window.Mode);
        Assert.False(window.Admits("2022-10-24T08:01:12"));
        Assert.False(window.Admits("2026-08-13T23:59:59"));
        Assert.True(window.Admits("2026-08-14T00:00:00"));
        Assert.True(window.Admits("2026-08-14T09:15:00"));
    }

    [Fact]
    public void ARecentDaysWindowAdmitsExactlyThatManyDays()
    {
        var window = ImportWindow.Resolve(
            new Dictionary<string, object?>
            {
                ["initialSyncMode"] = "LAST_N_DAYS",
                ["initialSyncDays"] = 7,
            },
            DeviceTime,
            GatewayNow);

        Assert.True(window.Admits("2026-08-07T00:00:00"));
        Assert.False(window.Admits("2026-08-06T23:59:59"));
    }

    [Fact]
    public void AnExplicitDateIsHonouredInTheDevicesOwnLocalTime()
    {
        var window = ImportWindow.Resolve(
            new Dictionary<string, object?>
            {
                ["initialSyncMode"] = "FROM_DATE",
                ["initialSyncFromDate"] = "2026-01-01",
            },
            DeviceTime,
            GatewayNow);

        Assert.True(window.Admits("2026-01-01T00:00:00"));
        Assert.False(window.Admits("2025-12-31T23:59:59"));
    }

    [Fact]
    public void AllHistoryAdmitsEverythingWhenThatIsWhatWasAsked()
    {
        var window = ImportWindow.Resolve(
            new Dictionary<string, object?> { ["initialSyncMode"] = "ALL_HISTORY" },
            DeviceTime,
            GatewayNow);

        Assert.Null(window.CutoffLocal);
        Assert.True(window.Admits("2022-10-24T08:01:12"));
    }

    [Fact]
    public void ABlankDateFallsBackToTodayRatherThanToEverything()
    {
        // The failure mode worth avoiding: a FROM_DATE window whose date field
        // was left empty must not quietly become "import four years".
        var window = ImportWindow.Resolve(
            new Dictionary<string, object?> { ["initialSyncMode"] = "FROM_DATE" },
            DeviceTime,
            GatewayNow);

        Assert.Equal("CURRENT_DATE", window.Mode);
        Assert.False(window.Admits("2022-10-24T08:01:12"));
    }

    [Fact]
    public void AnUnrecognisedModeFallsBackToTodayRatherThanToEverything()
    {
        var window = ImportWindow.Resolve(
            new Dictionary<string, object?> { ["initialSyncMode"] = "SOMETHING_ELSE" },
            DeviceTime,
            GatewayNow);

        Assert.Equal("CURRENT_DATE", window.Mode);
        Assert.False(window.Admits("2020-01-01T00:00:00"));
    }

    [Fact]
    public void TheCutoffFollowsTheDeviceClockNotTheGatewayClock()
    {
        // The punches being filtered are device wall clock. A gateway in another
        // timezone, or with a wrong clock, must not move the boundary.
        var window = ImportWindow.Resolve(
            new Dictionary<string, object?>(),
            "2026-08-14T00:30:00",
            // The gateway thinks it is the previous day.
            new DateTimeOffset(2026, 8, 13, 19, 30, 0, TimeSpan.Zero));

        Assert.Equal("2026-08-14T00:00:00", window.CutoffLocal);
    }

    [Fact]
    public void AFrozenCutoffKeepsAdmittingTheSameRecordsAfterMidnight()
    {
        // Recomputing the window on every poll would make LAST_N_DAYS slide
        // forward and silently stop admitting yesterday's punches at midnight.
        var frozen = ImportWindow.FromStoredCutoff("LAST_N_DAYS", "2026-08-07T00:00:00");

        Assert.True(frozen.Admits("2026-08-07T08:00:00"));
        Assert.True(frozen.Admits("2026-08-15T08:00:00"));
    }

    [Fact]
    public void TheDaysCountIsBoundedRatherThanTrusted()
    {
        var window = ImportWindow.Resolve(
            new Dictionary<string, object?>
            {
                ["initialSyncMode"] = "LAST_N_DAYS",
                ["initialSyncDays"] = 999_999,
            },
            DeviceTime,
            GatewayNow);

        // Clamped to ten years, so a typo cannot become an unbounded backfill.
        Assert.NotNull(window.CutoffLocal);
        Assert.True(string.CompareOrdinal(window.CutoffLocal!, "2016-01-01T00:00:00") > 0);
    }
}
