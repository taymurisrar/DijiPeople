using System.Globalization;

using DijiPeople.Gateway.Cloud;

namespace DijiPeople.Gateway.Runtime;

/// <summary>
/// Decides which of a terminal's stored punches are admitted into DijiPeople.
///
/// THE PROBLEM. This terminal family has no time-bounded read: every poll
/// returns the whole history, observed back to 2022 on the reference K50.
/// Uploading that on first connection would import four years of punches into
/// live attendance on the day a customer goes live, which is almost never what
/// they want and is very hard to unpick afterwards.
///
/// THE ANSWER. The gateway enumerates everything and fingerprints everything —
/// so the local dedupe knows about the old records and never reconsiders them —
/// but only admits punches inside the configured window. Nothing is deleted or
/// altered on the device: the older records stay exactly where they are, and a
/// customer who later decides they want them can widen the window and re-import.
///
/// THE CUTOFF IS FROZEN AT BASELINE. It is computed once, on the first
/// successful read of a device, and then persisted. Recomputing "today" on every
/// poll would work for CURRENT_DATE by accident and break LAST_N_DAYS
/// completely — the window would slide forward and yesterday's punches would
/// stop being admitted the moment the date rolled over.
///
/// COMPARISONS ARE DEVICE-LOCAL. The cutoff is derived from the terminal's own
/// clock, not the gateway machine's, because the punch timestamps being filtered
/// are device wall clock with no offset. Mixing the two would shift the boundary
/// by the difference between the two machines' timezones.
/// </summary>
public sealed class ImportWindow
{
    /// <summary>Null admits everything.</summary>
    public string? CutoffLocal { get; }

    public string Mode { get; }

    private ImportWindow(string mode, string? cutoffLocal)
    {
        Mode = mode;
        CutoffLocal = cutoffLocal;
    }

    public static ImportWindow All(string mode = "ALL_HISTORY") => new(mode, null);

    /// <summary>
    /// Works out the cutoff for a device on the day it is first read.
    ///
    /// <paramref name="deviceTimeLocal"/> is the terminal's own clock as it
    /// reported it in this same read. When the device did not report a clock the
    /// gateway's local time is used as the least-bad fallback and the caller is
    /// expected to log it — a terminal that cannot state its own time is already
    /// a health problem.
    /// </summary>
    public static ImportWindow Resolve(
        IReadOnlyDictionary<string, object?> configuration,
        string? deviceTimeLocal,
        DateTimeOffset gatewayNow)
    {
        var mode = ReadString(configuration, "initialSyncMode") ?? "CURRENT_DATE";

        if (string.Equals(mode, "ALL_HISTORY", StringComparison.OrdinalIgnoreCase))
        {
            return All(mode);
        }

        if (string.Equals(mode, "FROM_DATE", StringComparison.OrdinalIgnoreCase))
        {
            var from = ReadString(configuration, "initialSyncFromDate");
            if (TryParseDate(from, out var fromDate))
            {
                return new ImportWindow(mode, StartOfDay(fromDate));
            }

            // A FROM_DATE window with no usable date falls back to the
            // conservative default rather than to "everything": importing four
            // years because a date field was blank is the worse mistake.
            return new ImportWindow("CURRENT_DATE", StartOfDay(ReferenceDate(deviceTimeLocal, gatewayNow)));
        }

        var reference = ReferenceDate(deviceTimeLocal, gatewayNow);

        if (string.Equals(mode, "LAST_N_DAYS", StringComparison.OrdinalIgnoreCase))
        {
            var days = ReadInt(configuration, "initialSyncDays") ?? 7;
            days = Math.Clamp(days, 1, 3650);
            return new ImportWindow(mode, StartOfDay(reference.AddDays(-days)));
        }

        // CURRENT_DATE, and the default for anything unrecognised.
        return new ImportWindow("CURRENT_DATE", StartOfDay(reference));
    }

    /// <summary>Rebuilds a window from a cutoff already frozen for this device.</summary>
    public static ImportWindow FromStoredCutoff(string mode, string? cutoffLocal) =>
        new(mode, cutoffLocal);

    /// <summary>
    /// Ordinal string comparison, not date parsing.
    ///
    /// "yyyy-MM-ddTHH:mm:ss" is fixed-width and sorts lexicographically in the
    /// same order it sorts chronologically, so this needs no calendar and cannot
    /// accidentally attach a timezone to a device timestamp.
    /// </summary>
    public bool Admits(string occurredAtLocal) =>
        CutoffLocal is null || string.CompareOrdinal(occurredAtLocal, CutoffLocal) >= 0;

    private static DateTime ReferenceDate(string? deviceTimeLocal, DateTimeOffset gatewayNow)
    {
        if (!string.IsNullOrWhiteSpace(deviceTimeLocal) &&
            DateTime.TryParseExact(
                deviceTimeLocal,
                "yyyy-MM-dd'T'HH:mm:ss",
                CultureInfo.InvariantCulture,
                // The device states no offset; parsing must not invent one.
                DateTimeStyles.None,
                out var deviceTime))
        {
            return deviceTime.Date;
        }

        return gatewayNow.LocalDateTime.Date;
    }

    private static string StartOfDay(DateTime date) =>
        date.Date.ToString("yyyy-MM-dd'T'00:00:00", CultureInfo.InvariantCulture);

    private static bool TryParseDate(string? value, out DateTime date) =>
        DateTime.TryParseExact(
            value ?? string.Empty,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out date);

    private static string? ReadString(
        IReadOnlyDictionary<string, object?> configuration,
        string key)
    {
        if (!configuration.TryGetValue(key, out var raw) || raw is null) return null;

        var value = raw switch
        {
            string text => text,
            System.Text.Json.JsonElement element
                when element.ValueKind == System.Text.Json.JsonValueKind.String
                => element.GetString(),
            _ => raw.ToString(),
        };

        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static int? ReadInt(IReadOnlyDictionary<string, object?> configuration, string key)
    {
        if (!configuration.TryGetValue(key, out var raw) || raw is null) return null;

        return raw switch
        {
            int value => value,
            long value => (int)value,
            double value => (int)value,
            System.Text.Json.JsonElement element
                when element.ValueKind == System.Text.Json.JsonValueKind.Number &&
                     element.TryGetInt32(out var number) => number,
            string text when int.TryParse(
                text,
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var parsed) => parsed,
            _ => null,
        };
    }
}
