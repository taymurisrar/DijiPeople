using System.Text.RegularExpressions;

namespace DijiPeople.Gateway.Cloud;

/// <summary>
/// Checks a deserialised response before the gateway acts on it.
///
/// Deserialisation only proves the JSON parsed. It does not prove the server
/// sent a device address that is safe to dial, an interval that is safe to poll
/// at, or a device id that belongs to anything. This is the boundary where a
/// malformed or hostile response stops being data and would otherwise become
/// behaviour — so the gateway refuses a configuration outright rather than
/// applying the good half of it.
/// </summary>
internal static class CloudResponseValidator
{
    /// <summary>Absolute floor, whatever a response claims. See connector notes.</summary>
    public const int AbsoluteMinimumIntervalMinutes = 5;

    private static readonly Regex UuidPattern = new(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        RegexOptions.Compiled);

    private static readonly Regex HostPattern = new(
        // IPv4, or a hostname/label form. Deliberately narrow: the gateway only
        // ever dials LAN terminals, so exotic authority forms are refused rather
        // than passed to a socket.
        @"^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9](?:[A-Za-z0-9\-\.]{0,251}[A-Za-z0-9])?)$",
        RegexOptions.Compiled);

    public static void ValidatePairResponse(PairResponse? response)
    {
        if (response is null)
        {
            throw new CloudException(CloudFailureKind.InvalidResponse, "Pairing returned no body.");
        }

        if (!UuidPattern.IsMatch(response.GatewayId))
        {
            throw new CloudException(
                CloudFailureKind.InvalidResponse,
                "Pairing returned an unrecognised gateway identifier.");
        }

        // Length only. The value itself is never echoed into an exception, a log
        // line or a console message.
        if (response.Credential.Length is < 16 or > 512)
        {
            throw new CloudException(
                CloudFailureKind.InvalidResponse,
                "Pairing returned a credential that does not look valid.");
        }
    }

    /// <summary>
    /// Validates a configuration and returns the problems found.
    ///
    /// Devices that fail are reported and dropped individually — a single
    /// mistyped IP should not stop the other terminals at the site from syncing.
    /// A malformed response at the top level throws instead, because there is no
    /// safe subset of "the server did not send a configuration".
    /// </summary>
    public static IReadOnlyList<string> Sanitise(GatewayConfiguration? configuration)
    {
        if (configuration is null)
        {
            throw new CloudException(
                CloudFailureKind.InvalidResponse,
                "The configuration response was empty.");
        }

        if (!UuidPattern.IsMatch(configuration.GatewayId))
        {
            throw new CloudException(
                CloudFailureKind.InvalidResponse,
                "The configuration named an unrecognised gateway.");
        }

        var problems = new List<string>();

        configuration.Policy.HeartbeatIntervalSeconds =
            Clamp(configuration.Policy.HeartbeatIntervalSeconds, 15, 3600, 60);
        configuration.Policy.ConfigRefreshSeconds =
            Clamp(configuration.Policy.ConfigRefreshSeconds, 30, 86_400, 300);
        configuration.Policy.MaxEventsPerRequest =
            Clamp(configuration.Policy.MaxEventsPerRequest, 1, 5000, 5000);
        configuration.Policy.UploadBatchSize = Clamp(
            configuration.Policy.UploadBatchSize,
            1,
            configuration.Policy.MaxEventsPerRequest,
            Math.Min(500, configuration.Policy.MaxEventsPerRequest));
        configuration.Policy.ClockDriftWarningSeconds =
            Clamp(configuration.Policy.ClockDriftWarningSeconds, 1, 86_400, 60);
        configuration.Policy.ClockDriftCriticalSeconds =
            Clamp(configuration.Policy.ClockDriftCriticalSeconds, 1, 86_400, 300);

        foreach (var integration in configuration.Integrations.ToList())
        {
            if (!UuidPattern.IsMatch(integration.IntegrationId))
            {
                problems.Add($"Integration '{integration.Name}' has an unrecognised identifier and was ignored.");
                configuration.Integrations.Remove(integration);
                continue;
            }

            integration.MinimumIntervalMinutes = Clamp(
                integration.MinimumIntervalMinutes,
                AbsoluteMinimumIntervalMinutes,
                10_080,
                15);

            foreach (var device in integration.Devices.ToList())
            {
                var problem = ValidateDevice(device, integration);
                if (problem is not null)
                {
                    problems.Add(problem);
                    integration.Devices.Remove(device);
                }
            }
        }

        return problems;
    }

    private static string? ValidateDevice(
        DeviceConfiguration device,
        IntegrationConfiguration integration)
    {
        if (!UuidPattern.IsMatch(device.DeviceId))
        {
            return $"A device on '{integration.Name}' has an unrecognised identifier and was ignored.";
        }

        if (string.IsNullOrWhiteSpace(device.Host) || !HostPattern.IsMatch(device.Host))
        {
            return $"Device '{device.Name}' has no usable address and was ignored.";
        }

        if (device.Port is null or < 1 or > 65535)
        {
            return $"Device '{device.Name}' has an invalid port and was ignored.";
        }

        if (device.MachineNumber is < 0 or > 255)
        {
            return $"Device '{device.Name}' has an invalid device ID and was ignored.";
        }

        if (device.SyncPolicy is not null)
        {
            // Defence in depth. The web app validates this and the API clamps it
            // again, but a gateway that accepted a one-minute interval for a
            // terminal that re-reads its whole history on every poll would
            // hammer the customer's hardware regardless of who was at fault.
            var floor = Math.Max(integration.MinimumIntervalMinutes, AbsoluteMinimumIntervalMinutes);
            device.SyncPolicy.IntervalMinutes =
                Clamp(device.SyncPolicy.IntervalMinutes, floor, 10_080, floor);
            device.SyncPolicy.JitterSeconds =
                Clamp(device.SyncPolicy.JitterSeconds, 0, 3600, 0);
            device.SyncPolicy.MaxConcurrency =
                Clamp(device.SyncPolicy.MaxConcurrency, 1, 16, 1);
            device.SyncPolicy.RetryIntervalMinutes =
                Clamp(device.SyncPolicy.RetryIntervalMinutes, 1, 1440, 5);
            device.SyncPolicy.MaxRetries = Clamp(device.SyncPolicy.MaxRetries, 0, 20, 3);
        }

        return null;
    }

    private static int Clamp(int value, int min, int max, int fallback)
    {
        if (value < min || value > max) return fallback;
        return value;
    }
}
