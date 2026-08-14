using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace DijiPeople.Gateway.Connectors;

/// <summary>
/// The deduplication key for sources with no stable transaction id.
///
/// MUST STAY BYTE-IDENTICAL to RawAttendanceIngestionService.computeFingerprint
/// on the server. The gateway sends the fingerprint it computed and the server
/// keys its unique constraint on it, so a difference of one separator would make
/// every re-sent punch look new — silent duplication of payroll evidence. The
/// separator is U+241F (SYMBOL FOR UNIT SEPARATOR), which cannot occur inside
/// any component value.
///
/// The device serial is part of the hash so the value is meaningful on its own.
/// Correctness does not rest on that: the server independently scopes the
/// constraint by device.
///
/// KNOWN LIMIT, carried forward from the POC deliberately. This K50 records
/// second-level resolution and exposes no record id, so two genuinely distinct
/// punches by the same user in the same second with identical raw values hash
/// the same and the second is treated as a duplicate. Nothing in the payload can
/// separate them. The alternative — keying on arrival order — would duplicate
/// records on every re-read of the full history, which is a far worse failure.
/// </summary>
public static class EventFingerprint
{
    private const string Separator = "␟";

    public static string Compute(
        string? deviceSerialNumber,
        string externalUserId,
        string occurredAtLocal,
        int? verificationModeRaw,
        int? punchStateRaw,
        int? workCodeRaw)
    {
        var payload = string.Join(
            Separator,
            deviceSerialNumber ?? string.Empty,
            externalUserId,
            occurredAtLocal,
            Format(verificationModeRaw),
            Format(punchStateRaw),
            Format(workCodeRaw));

        return Convert.ToHexString(
                SHA256.HashData(Encoding.UTF8.GetBytes(payload)))
            .ToLowerInvariant();
    }

    /// <summary>
    /// Absent components render as an empty string, matching the server's
    /// `?? ''`. Invariant culture so a machine with a different locale cannot
    /// produce a different hash for the same punch.
    /// </summary>
    private static string Format(int? value) =>
        value?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
}
