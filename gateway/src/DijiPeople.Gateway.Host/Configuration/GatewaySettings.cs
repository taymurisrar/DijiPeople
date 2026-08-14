using System.Text.Json;
using System.Text.Json.Serialization;

namespace DijiPeople.Gateway.Configuration;

/// <summary>
/// Local, non-secret operational settings.
///
/// DELIBERATELY SMALL. Anything a tenant administrator can change — poll
/// schedules, device addresses, batch sizes, heartbeat cadence — is delivered by
/// DijiPeople and refreshed while the service runs. Duplicating those here would
/// create a second source of truth that drifts silently and needs a site visit
/// to correct. What is left is only what the gateway needs before it can talk to
/// DijiPeople at all, plus safety limits an installer may need to raise on
/// unusual hardware.
///
/// No secret is ever stored in this file. The service credential lives in
/// <see cref="GatewayPaths.CredentialFile"/>, DPAPI-protected.
/// </summary>
public sealed class GatewaySettings
{
    /// <summary>DijiPeople API base, e.g. https://api.dijipeople.com. HTTPS only.</summary>
    public string CloudBaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Path to the x86 ZKTeco worker. Defaults to the copy shipped beside the
    /// host, so a normal install needs no configuration at all.
    /// </summary>
    public string? ZkTecoWorkerPath { get; set; }

    /// <summary>
    /// Watchdog for one worker invocation. A full historical read on a terminal
    /// holding years of punches genuinely takes minutes, so this is generous;
    /// it exists to kill a hung process, not to bound normal work.
    /// </summary>
    public int WorkerTimeoutSeconds { get; set; } = 600;

    /// <summary>
    /// Ceiling on a single worker's stdout. A malformed or runaway worker must
    /// not be able to exhaust the gateway's memory.
    /// </summary>
    public int WorkerMaxOutputBytes { get; set; } = 64 * 1024 * 1024;

    /// <summary>
    /// Devices polled at once. One is the conservative default for legacy
    /// terminals, which do not enjoy concurrent sessions. The scheduler supports
    /// more for connectors that can take it.
    /// </summary>
    public int MaxConcurrentDeviceSyncs { get; set; } = 1;

    /// <summary>Verbosity for the local log files.</summary>
    public string LogLevel { get; set; } = "Information";

    /// <summary>Days of rolling log files to retain.</summary>
    public int LogRetentionDays { get; set; } = 14;

    /// <summary>Size cap per log file before it rolls.</summary>
    public long LogFileSizeLimitBytes { get; set; } = 16 * 1024 * 1024;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static GatewaySettings Load(GatewayPaths paths)
    {
        if (!File.Exists(paths.SettingsFile))
        {
            return new GatewaySettings();
        }

        try
        {
            var content = File.ReadAllText(paths.SettingsFile);
            return JsonSerializer.Deserialize<GatewaySettings>(content, Json)
                   ?? new GatewaySettings();
        }
        catch (Exception exception) when (exception is JsonException or IOException)
        {
            // A corrupt settings file must not stop the service from starting:
            // the defaults are workable and the operator can be told, whereas a
            // gateway that refuses to boot stops collecting attendance.
            return new GatewaySettings();
        }
    }

    public void Save(GatewayPaths paths)
    {
        paths.EnsureCreated();
        AtomicFile.WriteAllText(paths.SettingsFile, JsonSerializer.Serialize(this, Json));
    }

    /// <summary>
    /// Rejects a configuration that cannot work, before anything acts on it.
    /// Returns the problems rather than throwing on the first, so an installer
    /// can show them all at once.
    /// </summary>
    public IReadOnlyList<string> Validate()
    {
        var problems = new List<string>();

        if (string.IsNullOrWhiteSpace(CloudBaseUrl))
        {
            problems.Add("The DijiPeople address has not been configured.");
        }
        else if (!Uri.TryCreate(CloudBaseUrl, UriKind.Absolute, out var uri))
        {
            problems.Add($"'{CloudBaseUrl}' is not a valid address.");
        }
        else if (uri.Scheme != Uri.UriSchemeHttps &&
                 !uri.IsLoopback)
        {
            // Plain HTTP would put the service credential on the wire in clear.
            // Loopback is allowed so the gateway can be exercised against a
            // development API on the same machine.
            problems.Add("The DijiPeople address must use https.");
        }

        if (WorkerTimeoutSeconds is < 30 or > 3600)
        {
            problems.Add("The worker timeout must be between 30 and 3600 seconds.");
        }

        if (MaxConcurrentDeviceSyncs is < 1 or > 16)
        {
            problems.Add("Device concurrency must be between 1 and 16.");
        }

        return problems;
    }

    /// <summary>Resolves the worker path, defaulting to the bundled copy.</summary>
    public string ResolveWorkerPath()
    {
        if (!string.IsNullOrWhiteSpace(ZkTecoWorkerPath))
        {
            return ZkTecoWorkerPath;
        }

        return Path.Combine(
            GatewayPaths.InstallDirectory,
            "workers",
            "zkteco",
            "DijiPeople.ZkTeco.Worker.exe");
    }
}
