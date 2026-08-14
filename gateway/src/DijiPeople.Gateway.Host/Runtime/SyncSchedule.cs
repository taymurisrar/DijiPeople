using System.Globalization;

using DijiPeople.Gateway.Cloud;

namespace DijiPeople.Gateway.Runtime;

/// <summary>
/// When a device is next due.
///
/// Pure functions, no clock of their own and no I/O, because scheduling is the
/// part of a gateway that is hardest to observe in production and easiest to get
/// subtly wrong — an off-by-one in an active window means a site collects
/// nothing overnight and nobody notices for a week.
/// </summary>
public static class SyncSchedule
{
    /// <summary>
    /// Spreads devices that would otherwise wake together.
    ///
    /// Twenty terminals on one gateway sharing a 30-minute schedule would all
    /// poll on the half hour, and each poll pulls a full history. The jitter is
    /// operational staggering only: it is derived from the device id, so it is
    /// stable across restarts, and it never changes the interval an
    /// administrator configured — a 30-minute schedule stays 30 minutes, it just
    /// does not start on the same second as its neighbours.
    /// </summary>
    public static TimeSpan JitterFor(string deviceId, int jitterSeconds)
    {
        if (jitterSeconds <= 0) return TimeSpan.Zero;

        // Deterministic hash of the id. Not random: a restart must not reshuffle
        // every device onto a new offset, which would defeat the staggering
        // exactly when several gateways restart together after a power cut.
        var hash = 17;
        foreach (var character in deviceId)
        {
            hash = unchecked((hash * 31) + character);
        }

        var offset = Math.Abs(hash) % jitterSeconds;
        return TimeSpan.FromSeconds(offset);
    }

    /// <summary>
    /// Whether the current time falls inside the policy's daily window.
    ///
    /// A window whose end is before its start wraps midnight — "22:00 to 06:00"
    /// is a night shift, not a mistake. An unparseable window is treated as no
    /// window at all: refusing to poll because a time string was malformed would
    /// silently stop attendance collection.
    /// </summary>
    public static bool IsWithinActiveWindow(SyncPolicyConfiguration policy, DateTimeOffset now)
    {
        if (!TryParseTime(policy.ActiveWindowStart, out var start) ||
            !TryParseTime(policy.ActiveWindowEnd, out var end))
        {
            return true;
        }

        var local = ResolveLocalTime(policy.Timezone, now);
        var minutes = (local.Hour * 60) + local.Minute;

        if (start == end) return true;

        return start < end
            ? minutes >= start && minutes < end
            : minutes >= start || minutes < end;
    }

    /// <summary>
    /// Whether a device should be polled now.
    ///
    /// MANUAL mode never becomes due on its own — that is the whole meaning of
    /// the mode — but an explicit request still runs, which is handled by the
    /// caller rather than here.
    /// </summary>
    public static bool IsDue(
        SyncPolicyConfiguration policy,
        DateTimeOffset? lastCompletedAt,
        DateTimeOffset? nextEligibleAt,
        string deviceId,
        DateTimeOffset now)
    {
        if (string.Equals(policy.Mode, "MANUAL", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!IsWithinActiveWindow(policy, now))
        {
            return false;
        }

        // A retry backoff set after a failure wins over the ordinary interval,
        // so a device that is refusing connections is not hammered every cycle.
        if (nextEligibleAt is not null && now < nextEligibleAt.Value)
        {
            return false;
        }

        if (lastCompletedAt is null)
        {
            return true;
        }

        var interval = TimeSpan.FromMinutes(Math.Max(1, policy.IntervalMinutes));
        var jitter = JitterFor(deviceId, policy.JitterSeconds);

        return now >= lastCompletedAt.Value.Add(interval).Add(jitter);
    }

    /// <summary>When to try again after a failed cycle.</summary>
    public static DateTimeOffset NextRetryAt(
        SyncPolicyConfiguration policy,
        int consecutiveFailures,
        DateTimeOffset now)
    {
        var baseMinutes = Math.Max(1, policy.RetryIntervalMinutes);
        // Backs off, but never past the ordinary interval: a device that comes
        // back should be picked up on the normal schedule rather than sitting
        // idle because it failed several times an hour ago.
        var scaled = baseMinutes * Math.Min(Math.Max(consecutiveFailures, 1), 6);
        var capped = Math.Min(scaled, Math.Max(baseMinutes, policy.IntervalMinutes));
        return now.AddMinutes(capped);
    }

    private static bool TryParseTime(string? value, out int minutesOfDay)
    {
        minutesOfDay = 0;
        if (string.IsNullOrWhiteSpace(value)) return false;

        if (!TimeSpan.TryParseExact(
                value.Trim(),
                @"hh\:mm",
                CultureInfo.InvariantCulture,
                out var parsed))
        {
            return false;
        }

        minutesOfDay = (int)parsed.TotalMinutes;
        return true;
    }

    /// <summary>
    /// Resolves "now" in the policy's timezone.
    ///
    /// An unknown timezone id falls back to the gateway machine's local time
    /// rather than throwing: a mistyped zone should narrow correctness, not stop
    /// the site collecting attendance. This is a scheduling decision only — it
    /// never touches a punch timestamp, which stays exactly as the device stated
    /// it.
    /// </summary>
    private static DateTimeOffset ResolveLocalTime(string? timezone, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(timezone))
        {
            return now.ToLocalTime();
        }

        try
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(timezone);
            return TimeZoneInfo.ConvertTime(now, zone);
        }
        catch (Exception exception) when (
            exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return now.ToLocalTime();
        }
    }
}
