using System.Globalization;
using System.Text.Json;

using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Configuration;
using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Identity;
using DijiPeople.Gateway.Runtime;
using DijiPeople.Gateway.Storage;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

using Serilog;

namespace DijiPeople.Gateway.Cli;

/// <summary>
/// The administration commands an engineer runs at install time.
///
/// Everything a customer machine needs is here: configure the address, install
/// the service, pair it, check it, collect diagnostics, remove it. No Node.js,
/// no npm, no .NET SDK, no Git and no DijiPeople source is involved at any point.
/// </summary>
internal static class GatewayCommands
{
    private const string Usage = """
        DijiPeople Integration Gateway

        USAGE
          DijiPeople.Gateway.exe <command> [options]
          DijiPeople.Gateway.exe                       run in the foreground (the
                                                       Windows service uses this)

        SETUP (run as Administrator, in this order)
          configure --url <https://api.dijipeople.com>  set the DijiPeople address
          install                                      register the Windows service
          pair --code <PAIRING-CODE>                   connect this machine to a
                                                       gateway in DijiPeople
          start                                        start the service

        OPERATIONS
          status                                       what this gateway knows and
                                                       how much is waiting to upload
          diagnostics [--output <path>]                write a support bundle
          requeue                                      retry records that stopped
                                                       being retried
          stop | start | restart                       control the service
          uninstall                                    remove the service, keeping
                                                       local data

        NOTES
          The pairing code is single use and short lived. Generate it in DijiPeople
          under Settings, Integrations, Attendance, Gateways.

          The same package works for every tenant. Nothing tenant-specific is built
          into it: pairing is what connects this installation to one organisation.
        """;

    public static async Task<int> ExecuteAsync(
        string[] args,
        GatewayPaths paths,
        GatewaySettings settings)
    {
        var command = args[0].ToLowerInvariant();
        var options = ParseOptions(args.Skip(1).ToArray());

        return command switch
        {
            "configure" => Configure(paths, settings, options),
            "install" => Install(),
            "uninstall" => GatewayServiceControl.Uninstall(),
            "start" => GatewayServiceControl.Start(),
            "stop" => GatewayServiceControl.Stop(),
            "restart" => Restart(),
            "pair" => await PairAsync(paths, settings, options),
            "status" => Status(paths, settings),
            "diagnostics" => Diagnostics(paths, settings, options),
            "requeue" => await RequeueAsync(paths, settings),
            "version" => Version(),
            "help" or "--help" or "-h" or "/?" => Help(0),
            _ => Help(2, $"Unknown command '{command}'."),
        };
    }

    // ------------------------------------------------------------- configure

    private static int Configure(
        GatewayPaths paths,
        GatewaySettings settings,
        IReadOnlyDictionary<string, string> options)
    {
        if (options.TryGetValue("url", out var url))
        {
            settings.CloudBaseUrl = url.Trim();
        }

        if (options.TryGetValue("worker", out var worker))
        {
            settings.ZkTecoWorkerPath = worker.Trim();
        }

        if (options.TryGetValue("log-level", out var logLevel))
        {
            settings.LogLevel = logLevel.Trim();
        }

        var problems = settings.Validate();
        if (problems.Count > 0)
        {
            foreach (var problem in problems)
            {
                Console.Error.WriteLine($"  {problem}");
            }
            return 2;
        }

        settings.Save(paths);
        Console.WriteLine($"Configuration saved to {paths.SettingsFile}.");
        Console.WriteLine($"DijiPeople address: {settings.CloudBaseUrl}");
        return 0;
    }

    private static int Install()
    {
        var executable = Path.Combine(
            GatewayPaths.InstallDirectory,
            "DijiPeople.Gateway.exe");

        if (!File.Exists(executable))
        {
            Console.Error.WriteLine($"The gateway executable was not found at {executable}.");
            return 1;
        }

        return GatewayServiceControl.Install(executable);
    }

    private static int Restart()
    {
        GatewayServiceControl.Stop();
        return GatewayServiceControl.Start();
    }

    // ------------------------------------------------------------------ pair

    /// <summary>
    /// Redeems a one-time pairing code and stores the issued credential.
    ///
    /// The code is consumed server-side the moment this succeeds, so the order
    /// matters: the credential is written to the protected store BEFORE anything
    /// else can fail. A pairing that succeeded remotely but was not persisted
    /// locally would leave the operator holding a burnt code and a gateway that
    /// still cannot connect.
    ///
    /// The pairing code itself is never written anywhere — not to the settings
    /// file, not to the identity file, not to a log.
    /// </summary>
    private static async Task<int> PairAsync(
        GatewayPaths paths,
        GatewaySettings settings,
        IReadOnlyDictionary<string, string> options)
    {
        if (options.TryGetValue("url", out var url) && !string.IsNullOrWhiteSpace(url))
        {
            settings.CloudBaseUrl = url.Trim();
            settings.Save(paths);
        }

        var problems = settings.Validate();
        if (problems.Count > 0)
        {
            Console.Error.WriteLine("This gateway is not configured yet:");
            foreach (var problem in problems)
            {
                Console.Error.WriteLine($"  {problem}");
            }
            Console.Error.WriteLine();
            Console.Error.WriteLine(
                "Run: DijiPeople.Gateway.exe configure --url https://api.yourcompany.com");
            return 2;
        }

        if (!options.TryGetValue("code", out var code) || string.IsNullOrWhiteSpace(code))
        {
            Console.Error.WriteLine("A pairing code is required: pair --code ABCD-EFGH");
            return 2;
        }

        var identityStore = new GatewayIdentityStore(paths);

        if (identityStore.IsPaired && !options.ContainsKey("force"))
        {
            Console.Error.WriteLine(
                "This gateway is already paired. Re-pairing replaces its credential; add --force if that is what you intend.");
            return 2;
        }

        using var provider = BuildProvider(paths, settings);
        var cloud = provider.GetRequiredService<ICloudClient>();
        var connectors = provider.GetRequiredService<ConnectorRegistry>();

        Console.WriteLine("Connecting to DijiPeople…");

        try
        {
            var response = await cloud.PairAsync(
                new PairRequest
                {
                    PairingCode = code.Trim(),
                    Version = GatewayWorker.Version,
                    Platform = "WINDOWS",
                    Architecture = GatewayWorker.Architecture,
                    Capabilities = connectors.DescribeCapabilities(),
                },
                CancellationToken.None);

            identityStore.Save(
                new GatewayIdentity
                {
                    GatewayId = response.GatewayId,
                    CloudBaseUrl = settings.CloudBaseUrl,
                    // Generated locally and never derived from anything
                    // identifying about the machine.
                    InstallationId = Guid.NewGuid().ToString(),
                    TokenPrefix = response.TokenPrefix,
                    PairedAtUtc = DateTimeOffset.UtcNow,
                    Version = GatewayWorker.Version,
                },
                response.Credential);

            Console.WriteLine();
            Console.WriteLine("Paired successfully.");
            Console.WriteLine($"  Gateway    {response.GatewayId}");
            Console.WriteLine($"  Credential {response.TokenPrefix}… (stored encrypted for this machine)");
            Console.WriteLine();
            Console.WriteLine("Start the service to begin collecting attendance:");
            Console.WriteLine("  DijiPeople.Gateway.exe start");
            return 0;
        }
        catch (CloudException exception)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine($"Pairing failed: {exception.Message}");

            if (exception.Kind == CloudFailureKind.Transient)
            {
                Console.Error.WriteLine(
                    "Check that this machine can reach DijiPeople over HTTPS, then try again.");
            }
            else
            {
                Console.Error.WriteLine(
                    "Pairing codes are single use and expire quickly. Generate a new one in DijiPeople and try again.");
            }

            return 1;
        }
    }

    // ---------------------------------------------------------------- status

    private static int Status(GatewayPaths paths, GatewaySettings settings)
    {
        var identityStore = new GatewayIdentityStore(paths);
        var identity = identityStore.ReadIdentity();

        Console.WriteLine("DijiPeople Integration Gateway");
        Console.WriteLine("==============================");
        Console.WriteLine();
        Console.WriteLine($"  Version        {GatewayWorker.Version} ({GatewayWorker.Architecture})");
        Console.WriteLine($"  Service        {(GatewayServiceControl.Exists() ? "installed" : "not installed")}");
        Console.WriteLine($"  DijiPeople     {(string.IsNullOrWhiteSpace(settings.CloudBaseUrl) ? "not configured" : settings.CloudBaseUrl)}");
        Console.WriteLine($"  Paired         {(identityStore.IsPaired ? "yes" : "no")}");

        if (identity is not null)
        {
            Console.WriteLine($"  Gateway ID     {identity.GatewayId}");
            Console.WriteLine($"  Installation   {identity.InstallationId}");
            Console.WriteLine($"  Paired at      {identity.PairedAtUtc:yyyy-MM-dd HH:mm} UTC");
        }

        // Reports whether the credential can be read on this machine without
        // ever printing it. A copied installation folder fails here, which is
        // exactly the case an engineer needs to be able to diagnose.
        Console.WriteLine(
            $"  Credential     {(identityStore.ReadCredential() is null ? "NOT READABLE on this machine" : "readable")}");

        var worker = settings.ResolveWorkerPath();
        Console.WriteLine($"  ZKTeco worker  {(File.Exists(worker) ? "present" : "MISSING")} ({worker})");
        Console.WriteLine();

        using var provider = BuildProvider(paths, settings);
        var database = provider.GetRequiredService<GatewayDatabase>();
        database.Initialise();

        var store = provider.GetRequiredService<GatewayStore>();
        var metrics = store.GetQueueMetrics();

        Console.WriteLine("Local queue");
        Console.WriteLine($"  Waiting to upload      {metrics.PendingCount}");
        Console.WriteLine($"  Stopped retrying       {metrics.DeadLetterCount}");
        Console.WriteLine(
            $"  Oldest waiting         {metrics.OldestPendingAt?.ToString("yyyy-MM-dd HH:mm 'UTC'") ?? "—"}");
        Console.WriteLine(
            $"  Last successful upload {metrics.LastSuccessfulUploadAt?.ToString("yyyy-MM-dd HH:mm 'UTC'") ?? "—"}");
        Console.WriteLine();

        var health = store.GetDeviceHealth();
        Console.WriteLine($"Devices ({health.Count})");
        foreach (var (deviceId, state) in health)
        {
            Console.WriteLine($"  {deviceId}  {state}");
        }

        return 0;
    }

    // ----------------------------------------------------------- diagnostics

    /// <summary>
    /// Writes a support bundle.
    ///
    /// Contains what a remote engineer needs to diagnose an install and nothing
    /// that would be dangerous to email: no credential, no comm key, no device
    /// password, no attendance payloads, no configuration cache (which holds
    /// decrypted connector secrets). Counts, health, versions and recent log
    /// lines only.
    /// </summary>
    private static int Diagnostics(
        GatewayPaths paths,
        GatewaySettings settings,
        IReadOnlyDictionary<string, string> options)
    {
        var identityStore = new GatewayIdentityStore(paths);
        var identity = identityStore.ReadIdentity();

        using var provider = BuildProvider(paths, settings);
        var database = provider.GetRequiredService<GatewayDatabase>();
        database.Initialise();

        var store = provider.GetRequiredService<GatewayStore>();
        var metrics = store.GetQueueMetrics();
        var connectors = provider.GetRequiredService<ConnectorRegistry>();

        var bundle = new
        {
            generatedAtUtc = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture),
            gateway = new
            {
                version = GatewayWorker.Version,
                architecture = GatewayWorker.Architecture,
                serviceInstalled = GatewayServiceControl.Exists(),
                gatewayId = identity?.GatewayId,
                installationId = identity?.InstallationId,
                pairedAtUtc = identity?.PairedAtUtc,
                credentialReadable = identityStore.ReadCredential() is not null,
                cloudBaseUrl = identity?.CloudBaseUrl ?? settings.CloudBaseUrl,
            },
            machine = new
            {
                os = Environment.OSVersion.VersionString,
                is64Bit = Environment.Is64BitOperatingSystem,
                processors = Environment.ProcessorCount,
                machineTimezone = TimeZoneInfo.Local.Id,
            },
            worker = new
            {
                path = settings.ResolveWorkerPath(),
                present = File.Exists(settings.ResolveWorkerPath()),
                timeoutSeconds = settings.WorkerTimeoutSeconds,
            },
            connectors = connectors.DescribeCapabilities(),
            queue = new
            {
                pending = metrics.PendingCount,
                deadLettered = metrics.DeadLetterCount,
                oldestPendingAt = metrics.OldestPendingAt,
                lastSuccessfulUploadAt = metrics.LastSuccessfulUploadAt,
            },
            deviceHealth = store.GetDeviceHealth(),
            recentLog = ReadRecentLogLines(paths, 500),
        };

        var output = options.TryGetValue("output", out var path) && !string.IsNullOrWhiteSpace(path)
            ? path
            : Path.Combine(
                paths.DiagnosticsDirectory,
                $"gateway-diagnostics-{DateTime.UtcNow:yyyyMMdd-HHmmss}.json");

        AtomicFile.WriteAllText(
            output,
            JsonSerializer.Serialize(bundle, new JsonSerializerOptions { WriteIndented = true }));

        Console.WriteLine($"Diagnostics written to {Path.GetFullPath(output)}");
        Console.WriteLine("It contains no credentials, device keys or attendance records.");
        return 0;
    }

    private static string[] ReadRecentLogLines(GatewayPaths paths, int count)
    {
        try
        {
            var newest = new DirectoryInfo(paths.LogDirectory)
                .GetFiles("gateway-*.log")
                .OrderByDescending(file => file.LastWriteTimeUtc)
                .FirstOrDefault();

            if (newest is null) return Array.Empty<string>();

            // Shared read: the service is very likely writing this file right now.
            using var stream = new FileStream(
                newest.FullName,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite);
            using var reader = new StreamReader(stream);

            var lines = new Queue<string>(count);
            while (reader.ReadLine() is { } line)
            {
                if (lines.Count == count) lines.Dequeue();
                lines.Enqueue(line);
            }

            return lines.ToArray();
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return new[] { $"(log files could not be read: {exception.Message})" };
        }
    }

    // --------------------------------------------------------------- requeue

    private static async Task<int> RequeueAsync(GatewayPaths paths, GatewaySettings settings)
    {
        using var provider = BuildProvider(paths, settings);
        provider.GetRequiredService<GatewayDatabase>().Initialise();

        var store = provider.GetRequiredService<GatewayStore>();
        var requeued = await store.RequeueDeadLettersAsync();

        Console.WriteLine(
            requeued == 0
                ? "Nothing had stopped retrying."
                : $"{requeued} attendance record(s) will be retried. DijiPeople discards anything it already holds.");

        return 0;
    }

    private static int Version()
    {
        Console.WriteLine($"{GatewayWorker.Version} ({GatewayWorker.Architecture})");
        return 0;
    }

    private static int Help(int exitCode, string? error = null)
    {
        if (error is not null)
        {
            Console.Error.WriteLine(error);
            Console.Error.WriteLine();
        }

        Console.WriteLine(Usage);
        return exitCode;
    }

    /// <summary>
    /// Builds the same object graph the service uses, minus the hosted loop.
    /// A command that used a different HTTP or storage setup could succeed where
    /// the service then fails, which is the least useful kind of green tick.
    /// </summary>
    private static ServiceProvider BuildProvider(GatewayPaths paths, GatewaySettings settings)
    {
        var services = new ServiceCollection();
        services.AddLogging(builder => builder.AddSerilog(dispose: false));
        Program.RegisterServices(services, paths, settings);
        return services.BuildServiceProvider();
    }

    /// <summary>
    /// Parses `--key value` and `--flag`.
    ///
    /// Deliberately minimal, and deliberately not a place a secret is
    /// positional: the pairing code is passed as `--code` so it is obvious in a
    /// runbook what it is, and the gateway credential is never a command-line
    /// argument at all — a command line is visible to every process on the
    /// machine.
    /// </summary>
    private static Dictionary<string, string> ParseOptions(string[] args)
    {
        var options = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < args.Length; index++)
        {
            var token = args[index];
            if (!token.StartsWith("--", StringComparison.Ordinal)) continue;

            var key = token[2..];
            var hasValue = index + 1 < args.Length &&
                           !args[index + 1].StartsWith("--", StringComparison.Ordinal);

            options[key] = hasValue ? args[++index] : "true";
        }

        return options;
    }
}
