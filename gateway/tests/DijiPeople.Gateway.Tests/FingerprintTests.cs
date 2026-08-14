using DijiPeople.Gateway.Connectors;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// The gateway and the server must produce the same fingerprint for the same
/// punch, byte for byte.
///
/// These vectors were produced by running the SERVER'S implementation
/// (RawAttendanceIngestionService.computeFingerprint) and pasting its output.
/// They are not the gateway's own output checked against itself, which would
/// pass no matter how far the two drifted. If a change to either side breaks
/// this test, the queue would start re-uploading every punch as new.
/// </summary>
public class FingerprintTests
{
    [Fact]
    public void MatchesTheServerForACompleteRecord()
    {
        var fingerprint = EventFingerprint.Compute(
            "A2QO221160250",
            "25",
            "2026-08-14T09:15:32",
            1,
            0,
            0);

        Assert.Equal(
            "2507206dfd1bf1cbe81ce3a79a4dd19fb3b35774e67fd5282bd4eee2dfba033a",
            fingerprint);
    }

    [Fact]
    public void MatchesTheServerWhenOptionalFieldsAreAbsent()
    {
        // The server renders an absent value as an empty string, not as "null"
        // and not by omitting the separator. Getting this wrong is invisible
        // until a device that reports no work code duplicates its whole history.
        var fingerprint = EventFingerprint.Compute(
            null,
            "7",
            "2026-01-02T03:04:05",
            null,
            null,
            null);

        Assert.Equal(
            "9bcca5f239a02815cb4ddc9525f733115d9b674975b1a1aac5ba22cc861a7894",
            fingerprint);
    }

    [Fact]
    public void SeparatesDevicesWithTheSamePunch()
    {
        // Two terminals, identical user id and identical instant. Without the
        // serial in the hash the second device's punch would be dropped as a
        // duplicate of the first — silent data loss across a multi-site tenant.
        var first = EventFingerprint.Compute("SERIAL-A", "1", "2026-08-14T09:00:00", 1, 0, 0);
        var second = EventFingerprint.Compute("SERIAL-B", "1", "2026-08-14T09:00:00", 1, 0, 0);

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void DistinguishesEveryComponent()
    {
        var baseline = EventFingerprint.Compute("S", "1", "2026-08-14T09:00:00", 1, 0, 0);

        Assert.NotEqual(baseline, EventFingerprint.Compute("S", "2", "2026-08-14T09:00:00", 1, 0, 0));
        Assert.NotEqual(baseline, EventFingerprint.Compute("S", "1", "2026-08-14T09:00:01", 1, 0, 0));
        Assert.NotEqual(baseline, EventFingerprint.Compute("S", "1", "2026-08-14T09:00:00", 2, 0, 0));
        Assert.NotEqual(baseline, EventFingerprint.Compute("S", "1", "2026-08-14T09:00:00", 1, 1, 0));
        Assert.NotEqual(baseline, EventFingerprint.Compute("S", "1", "2026-08-14T09:00:00", 1, 0, 5));
    }
}
