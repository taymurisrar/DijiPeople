using DijiPeople.Gateway.Cli;
using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Configuration;
using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Connectors.ZkTeco;
using DijiPeople.Gateway.Identity;
using DijiPeople.Gateway.Runtime;
using DijiPeople.Gateway.Storage;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using Microsoft.Extensions.Logging;

using Serilog;
using Serilog.Events;

namespace DijiPeople.Gateway;

/// <summary>
/// DijiPeople Integration Gateway.
///
/// One executable with two jobs. Run with no arguments it is the Windows
/// service: it starts at boot, needs no logged-in user, and keeps running
/// through device failures, network outages and API outages. Run with a command
/// it is the installer/administration tool an engineer uses once, at setup.
///
/// Combining them keeps the customer's install to a single folder and means the
/// pairing tool cannot drift out of step with the service that has to use what
/// it wrote.
/// </summary>
internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        var paths = new GatewayPaths();
        paths.EnsureCreated();

        var settings = GatewaySettings.Load(paths);

        ConfigureLogging(paths, settings);

        try
        {
            // Anything with a verb is administration and exits when it is done.
            // Only the bare invocation becomes the long-running service.
            if (args.Length > 0 && !string.Equals(args[0], "run", StringComparison.OrdinalIgnoreCase))
            {
                return await GatewayCommands.ExecuteAsync(args, paths, settings);
            }

            await RunServiceAsync(args, paths, settings);
            return 0;
        }
        catch (Exception exception)
        {
            Log.Fatal(exception, "The DijiPeople Integration Gateway could not start.");
            return 1;
        }
        finally
        {
            await Log.CloseAndFlushAsync();
        }
    }

    private static async Task RunServiceAsync(
        string[] args,
        GatewayPaths paths,
        GatewaySettings settings)
    {
        var problems = settings.Validate();
        if (problems.Count > 0)
        {
            // Logged rather than fatal. A service that exits because it is not
            // configured yet looks broken in the Services console; one that runs
            // and says what it needs can be fixed and picks the change up.
            foreach (var problem in problems)
            {
                Log.Error("Configuration problem: {Problem}", problem);
            }
        }

        var builder = Host.CreateApplicationBuilder(args);

        builder.Services.AddSerilog();

        // Makes the process a genuine Windows service when the SCM starts it,
        // and a normal console application when an engineer runs it by hand.
        // Both paths execute identical code, so a console test is a real test.
        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = GatewayServiceControl.ServiceName;
        });

        RegisterServices(builder.Services, paths, settings);
        builder.Services.AddHostedService<GatewayWorker>();

        var host = builder.Build();

        // Applied before the loop starts so a schema problem surfaces at start-up
        // rather than on the first punch.
        host.Services.GetRequiredService<GatewayDatabase>().Initialise();

        if (WindowsServiceHelpers.IsWindowsService())
        {
            Log.Information("Running as the Windows service '{Service}'.", GatewayServiceControl.ServiceName);
        }

        await host.RunAsync();
    }

    /// <summary>
    /// Wires the object graph.
    ///
    /// Shared by the service and by the administration commands, so pairing
    /// exercises the same HTTP client, the same TLS behaviour and the same
    /// credential store the service will use — a pairing that works and a
    /// service that then cannot connect is the failure this avoids.
    /// </summary>
    internal static void RegisterServices(
        IServiceCollection services,
        GatewayPaths paths,
        GatewaySettings settings)
    {
        services.AddSingleton(paths);
        services.AddSingleton(settings);
        services.AddSingleton<GatewayIdentityStore>();

        services.AddSingleton(provider => new GatewayDatabase(
            paths.DatabaseFile,
            provider.GetRequiredService<ILogger<GatewayDatabase>>()));
        services.AddSingleton<GatewayStore>();

        services.AddHttpClient<ICloudClient, CloudClient>(client =>
        {
            var identity = new GatewayIdentityStore(paths).ReadIdentity();

            // The paired address wins over the local settings file. A settings
            // file edited to point elsewhere must not silently redirect a gateway
            // that is already paired somewhere else.
            var baseUrl = identity?.CloudBaseUrl is { Length: > 0 } paired
                ? paired
                : settings.CloudBaseUrl;

            if (!string.IsNullOrWhiteSpace(baseUrl))
            {
                client.BaseAddress = new Uri(EnsureTrailingSlash(baseUrl));
            }

            // Generous: a first upload after a long outage can be large, and a
            // timeout that fires mid-request costs a round trip for nothing.
            client.Timeout = TimeSpan.FromMinutes(3);
            client.DefaultRequestHeaders.UserAgent.ParseAdd(
                $"DijiPeople-Gateway/{GatewayWorker.Version}");
        })
        // The default handler honours the machine's WinHTTP/IE proxy settings,
        // which is how a corporate proxy is picked up without configuring one
        // here. Nothing custom is layered on top: an enterprise proxy scheme this
        // does not cover is a deliberate gap, not a silent failure.
        .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            UseProxy = true,
            AutomaticDecompression = System.Net.DecompressionMethods.All,
        });

        services.AddSingleton(provider => new ZkTecoWorkerClient(
            settings.ResolveWorkerPath(),
            TimeSpan.FromSeconds(settings.WorkerTimeoutSeconds),
            settings.WorkerMaxOutputBytes,
            provider.GetRequiredService<ILogger<ZkTecoWorkerClient>>()));

        services.AddSingleton<IGatewayAttendanceConnector, ZkTecoLegacyConnector>();
        services.AddSingleton<ConnectorRegistry>();

        services.AddSingleton<DeviceLockRegistry>();
        services.AddSingleton<SyncRunner>();
        services.AddSingleton<UploadPump>();
        services.AddSingleton<ProvisioningExecutor>();
    }

    /// <summary>
    /// Rolling, size-limited local logs.
    ///
    /// Unbounded logs on an unattended customer machine eventually fill a disk,
    /// which takes the gateway down for a reason that has nothing to do with
    /// attendance. Files roll daily and by size, and old ones are removed.
    ///
    /// Nothing secret reaches these files: the credential, the comm key, device
    /// passwords and biometric data have no path to a log statement anywhere in
    /// this codebase, and the one place a comm key appears on a command line is
    /// masked before it is written.
    /// </summary>
    private static void ConfigureLogging(GatewayPaths paths, GatewaySettings settings)
    {
        var level = Enum.TryParse<LogEventLevel>(settings.LogLevel, ignoreCase: true, out var parsed)
            ? parsed
            : LogEventLevel.Information;

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Is(level)
            .Enrich.FromLogContext()
            .WriteTo.Console(
                outputTemplate: "{Timestamp:HH:mm:ss} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
            .WriteTo.File(
                Path.Combine(paths.LogDirectory, "gateway-.log"),
                rollingInterval: RollingInterval.Day,
                fileSizeLimitBytes: settings.LogFileSizeLimitBytes,
                rollOnFileSizeLimit: true,
                retainedFileCountLimit: Math.Max(settings.LogRetentionDays, 1),
                shared: true,
                outputTemplate:
                "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
            .CreateLogger();
    }

    private static string EnsureTrailingSlash(string value) =>
        value.EndsWith('/') ? value : value + "/";
}
