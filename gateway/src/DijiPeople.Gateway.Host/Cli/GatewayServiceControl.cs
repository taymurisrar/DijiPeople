using System.Diagnostics;

namespace DijiPeople.Gateway.Cli;

/// <summary>
/// Install, start, stop and remove the Windows service.
///
/// Driven through sc.exe rather than a bespoke installer framework. The Service
/// Control Manager is the mechanism Windows already provides for exactly this,
/// it is what an administrator will reach for when something goes wrong, and it
/// leaves nothing behind that a support engineer has to learn. The Agent Desktop
/// app's electron-builder/NSIS pipeline was considered and is not reusable here:
/// it packages an Electron application directory, not a .NET Windows service,
/// and bending it to do so would couple two unrelated products' release paths.
/// </summary>
internal static class GatewayServiceControl
{
    public const string ServiceName = "DijiPeopleIntegrationGateway";
    public const string DisplayName = "DijiPeople Integration Gateway";

    private const string Description =
        "Collects attendance from local devices and synchronises it with DijiPeople.";

    /// <summary>
    /// Registers the service to start automatically.
    ///
    /// LocalSystem is used because the ZKTeco COM component and the machine-scope
    /// DPAPI credential both need an account that exists before any user logs in
    /// and survives that user leaving the company. `delayed-auto` lets the
    /// network stack settle first, so the gateway's first heartbeat after a
    /// reboot does not fail on a DNS lookup that was not ready yet.
    /// </summary>
    public static int Install(string executablePath)
    {
        if (Exists())
        {
            Console.WriteLine($"The '{DisplayName}' service is already installed.");
            return 0;
        }

        var exit = RunServiceControl(
            "create", ServiceName,
            $"binPath= \"{executablePath}\"",
            $"DisplayName= \"{DisplayName}\"",
            "start= delayed-auto");

        if (exit != 0)
        {
            Console.Error.WriteLine(
                "The service could not be created. Run this command from an elevated (Administrator) prompt.");
            return exit;
        }

        RunServiceControl("description", ServiceName, Description);

        // Restart on failure rather than leaving a stopped service behind. A
        // gateway that stopped at 02:00 and stayed stopped means a site's whole
        // day of attendance is missing before anyone notices.
        RunServiceControl("failure", ServiceName, "reset= 86400", "actions= restart/60000/restart/60000/restart/300000");

        Console.WriteLine($"Installed '{DisplayName}'. It will start automatically at boot.");
        return 0;
    }

    public static int Start()
    {
        var exit = RunServiceControl("start", ServiceName);
        // 1056 is "already running", which is the state the caller wanted.
        return exit is 0 or 1056 ? 0 : exit;
    }

    public static int Stop()
    {
        var exit = RunServiceControl("stop", ServiceName);
        // 1062 is "not started".
        return exit is 0 or 1062 ? 0 : exit;
    }

    /// <summary>
    /// Removes the service.
    ///
    /// Deliberately leaves the data folder alone. It holds the local queue and
    /// the sync history, and an uninstall performed to upgrade or to move a
    /// machine must not silently discard punches that were never uploaded.
    /// </summary>
    public static int Uninstall()
    {
        if (!Exists())
        {
            Console.WriteLine($"The '{DisplayName}' service is not installed.");
            return 0;
        }

        Stop();
        var exit = RunServiceControl("delete", ServiceName);

        if (exit == 0)
        {
            Console.WriteLine(
                $"Removed '{DisplayName}'. Local data and logs were left in place; delete them manually if this machine will not be used again.");
        }
        else
        {
            Console.Error.WriteLine(
                "The service could not be removed. Run this command from an elevated (Administrator) prompt.");
        }

        return exit;
    }

    public static bool Exists() => RunServiceControl("query", ServiceName) == 0;

    private static int RunServiceControl(params string[] arguments)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "sc.exe",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };

        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        try
        {
            using var process = Process.Start(startInfo);
            if (process is null) return -1;

            process.StandardOutput.ReadToEnd();
            process.StandardError.ReadToEnd();
            process.WaitForExit(30_000);
            return process.HasExited ? process.ExitCode : -1;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"sc.exe could not be run: {exception.Message}");
            return -1;
        }
    }
}
