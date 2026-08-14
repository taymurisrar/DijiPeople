using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DijiPeople.ZkTeco.Worker;

/// <summary>
/// DijiPeople ZKTeco legacy worker — x86, read-only, single shot.
///
///   create COM instance -> Connect_Net -> read -> Disconnect -> release COM
///
/// This executable is self-contained and is the ONLY artefact a customer's
/// Windows machine needs for device diagnostics: no Node.js, no npm, no .NET
/// SDK, no Git, no DijiPeople source.
///
/// Output channels:
///   stdout  human-readable diagnostic report, or the raw JSON contract when
///           --json is passed (the DijiPeople CLI always passes it)
///   stderr  tracing
///   --output &lt;path&gt;  writes the JSON contract to a file
///
/// Exit codes: 0 = success, 1 = a reported error (report/JSON still written),
/// 2 = usage error.
/// </summary>
internal static class Program
{
    private static readonly JsonSerializerOptions CompactJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    private static readonly JsonSerializerOptions PrettyJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };

    private static int Main(string[] rawArgs)
    {
        var result = new WorkerResult { Runtime = DescribeRuntime() };
        var trace = (string message) => Console.Error.WriteLine($"[worker] {message}");
        void Diagnose(string message)
        {
            result.Diagnostics.Add(message);
            trace(message);
        }

        WorkerOptions options;
        try
        {
            if (rawArgs.Contains("--help") || rawArgs.Contains("-h") || rawArgs.Contains("/?"))
            {
                Console.Out.WriteLine(WorkerOptions.Usage);
                return 2;
            }

            options = WorkerOptions.Parse(rawArgs);
        }
        catch (WorkerException exception)
        {
            result.Error = ToError(exception);
            Console.Error.WriteLine($"[worker] {exception.Code}: {exception.Message}");
            Console.Out.WriteLine(WorkerOptions.Usage);
            return 2;
        }

        result.Mode = options.Mode.ToString().ToLowerInvariant();
        result.Com = new ComInfo { ProgId = ZkemAdapter.ProgId, Clsid = ZkemAdapter.ExpectedClsid };

        // Fail loudly rather than surfacing 0x80040154 from deep inside COM.
        if (Environment.Is64BitProcess)
        {
            result.Error = new WorkerError
            {
                Code = "ARCHITECTURE_MISMATCH",
                Message =
                    "This worker is running as a 64-bit process. zkemkeeper is registered only under " +
                    "WOW6432Node and requires x86. Rebuild/publish with -r win-x86 and run the x86 binary.",
            };
            Emit(result, options);
            return 1;
        }

        Diagnose($"mode={result.Mode} runtime x86 confirmed ({result.Runtime.ProcessArchitecture}, {result.Runtime.Framework})");

        ZkemAdapter? adapter = null;
        try
        {
            adapter = ZkemAdapter.Create(options, Diagnose);
            result.Com.Instantiated = true;

            // Type metadata only. Reading it needs the COM object but NOT a
            // device connection, which is why --capabilities never dials the
            // terminal: capability inspection is not a device operation.
            if (options.ReadCapabilities)
            {
                result.Capabilities = adapter.Probe();
                ApplyMethodFilter(result.Capabilities, options.MethodFilter);
                Diagnose(result.Capabilities.TypeInfoAvailable
                    ? $"SDK type information enumerated: {result.Capabilities.Methods.Count} method(s)"
                    : $"SDK type information unavailable: {result.Capabilities.ProbeError}");
            }

            if (options.RequiresConnection)
            {
                result.Connection = adapter.Connect();

                if (options.ReadDeviceInfo)
                {
                    result.Device = adapter.ReadDeviceInfo();
                    Diagnose($"device identity read (serial={result.Device.SerialNumber ?? "unavailable"})");
                }

                if (options.ReadUsers)
                {
                    result.Users = adapter.ReadUsers();
                }

                if (options.ReadAttendance)
                {
                    result.Attendance = adapter.ReadAttendance();
                }

                // Opt-in only. Never reached on a default run, and never reached
                // by --capabilities, which does not connect at all.
                if (options.ProbeLatestLog)
                {
                    Diagnose("OPT-IN: --probe-latest-log requested; ReadLastestLogData will be invoked once");
                    result.LatestLogProbe = adapter.ProbeLatestLog();
                }
            }
            else
            {
                Diagnose("no device connection required for this mode");
            }
        }
        catch (WorkerException exception)
        {
            result.Error = ToError(exception);
            trace($"failed: {exception.Code} {exception.Message}");
        }
        catch (Exception exception)
        {
            result.Error = new WorkerError
            {
                Code = "UNKNOWN_ERROR",
                Message = $"{exception.GetType().Name}: {exception.Message}",
                HResult = ComDispatch.FormatHResult(exception),
            };
            trace($"failed: {exception}");
        }
        finally
        {
            // The device session is released even when a read threw.
            if (adapter is not null)
            {
                var disconnected = adapter.Disconnect();
                if (result.Connection is not null)
                {
                    result.Connection.Disconnected = disconnected;
                    if (!disconnected)
                    {
                        Diagnose("Disconnect reported failure");
                    }
                }

                adapter.Dispose();
                Diagnose("COM resources released");
            }
        }

        Emit(result, options);
        return result.Error is null ? 0 : 1;
    }

    /// <summary>
    /// Narrows the signature dump to methods whose name contains the filter.
    /// The full method-name list is kept so the filtered view still shows what
    /// else exists on the component.
    /// </summary>
    private static void ApplyMethodFilter(SdkCapabilities capabilities, string? filter)
    {
        if (string.IsNullOrWhiteSpace(filter) || !capabilities.TypeInfoAvailable)
        {
            return;
        }

        capabilities.FilteredBy = filter;

        var matches = capabilities.Signatures
            .Where(signature => signature.Name.Contains(filter, StringComparison.OrdinalIgnoreCase))
            .ToList();

        capabilities.Signatures = matches;
        capabilities.TargetSignatures = matches;
    }

    /// <summary>
    /// Writes the result out. stdout carries the human report unless --json was
    /// requested, in which case it carries the machine contract verbatim — that
    /// is what the DijiPeople CLI parses.
    /// </summary>
    private static void Emit(WorkerResult result, WorkerOptions options)
    {
        if (options.OutputPath is not null)
        {
            try
            {
                var directory = Path.GetDirectoryName(Path.GetFullPath(options.OutputPath));
                if (!string.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                File.WriteAllText(
                    options.OutputPath,
                    JsonSerializer.Serialize(result, PrettyJson) + Environment.NewLine,
                    new UTF8Encoding(false));

                Console.Error.WriteLine($"[worker] wrote {Path.GetFullPath(options.OutputPath)}");
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine($"[worker] could not write {options.OutputPath}: {exception.Message}");
                result.Error ??= new WorkerError
                {
                    Code = "OUTPUT_WRITE_FAILED",
                    Message = $"Could not write {options.OutputPath}: {exception.Message}",
                };
            }
        }

        if (options.JsonToStdout)
        {
            Console.Out.Write(JsonSerializer.Serialize(result, CompactJson));
            Console.Out.Flush();
            return;
        }

        ConsoleReport.Render(result, options, Console.Out);
        if (options.OutputPath is not null)
        {
            Console.Out.WriteLine($"JSON written to: {Path.GetFullPath(options.OutputPath)}");
            Console.Out.WriteLine();
        }
    }

    private static RuntimeInfo DescribeRuntime() => new()
    {
        Is64BitProcess = Environment.Is64BitProcess,
        ProcessArchitecture = RuntimeInformation.ProcessArchitecture.ToString(),
        Framework = RuntimeInformation.FrameworkDescription,
        OsVersion = RuntimeInformation.OSDescription,
        Is64BitOperatingSystem = Environment.Is64BitOperatingSystem,
    };

    private static WorkerError ToError(WorkerException exception) => new()
    {
        Code = exception.Code,
        Message = exception.Message,
        HResult = exception.HResultText,
        SdkErrorCode = exception.SdkErrorCode,
    };
}

/// <summary>What the worker was asked to do. Selected by an explicit mode flag.</summary>
internal enum WorkerMode
{
    /// <summary>Everything: capabilities, device, users, attendance. The default.</summary>
    Poc,
    /// <summary>Connect, read identity, disconnect.</summary>
    Test,
    /// <summary>SDK type information only. Does NOT connect to the device.</summary>
    Capabilities,
    /// <summary>Connect, read device metadata and clock.</summary>
    DeviceInfo,
    /// <summary>Connect, read the user directory.</summary>
    Users,
    /// <summary>Connect, read raw attendance transactions.</summary>
    Attendance,
}

/// <summary>Worker invocation options. Nothing about the device is hard-coded.</summary>
internal sealed class WorkerOptions
{
    public const string Usage = """
        DijiPeople ZKTeco legacy worker (x86, read-only)

        Self-contained: this executable needs no Node.js, npm, .NET SDK or Git on
        the machine it runs on. It does need zkemkeeper registered (32-bit COM).

        USAGE
          DijiPeople.ZkTeco.Worker.exe <mode> [options]

        MODES (pick one; --poc is the default)
          --poc                    Everything: capabilities, device, users, attendance
          --test                   Connect, read device identity, disconnect
          --device-info            Connect, read device metadata and clock
          --users                  Connect, read the user directory
          --attendance             Connect, read raw attendance transactions
          --capabilities           SDK type information only — does NOT connect
                                   to the device

        DEVICE (required except for --capabilities)
          --host <ip>              Device address
          --port <n>               Device TCP port                    (default 4370)
          --machine-number <n>     Device / machine ID                (default 1)
          --comm-key <n>           Comm key; 0 skips SetCommPassword  (default 0)

        LIMITS
          --max-users <n>          Safety cap on the user loop        (default 100000)
          --max-attendance <n>     Safety cap on the punch loop       (default 1000000)

        OUTPUT
          --output <path>          Write the JSON result to a file
          --json                   Emit raw JSON on stdout instead of the report
          --method <substring>     --capabilities: show only matching signatures

        MODIFIERS (override the mode)
          --skip-users             Do not read the user directory
          --skip-attendance        Do not read attendance logs
          --skip-capabilities      Do not enumerate SDK type information

        OPT-IN EXPERIMENT (never runs otherwise)
          --probe-latest-log       Call ReadLastestLogData once. Side effects on any
                                   device-side read marker are UNKNOWN and may disturb
                                   the customer's V2011 incremental downloads.
                                   Requires a connecting mode. Off by default.
          --probe-limit <n>        Records to drain during the probe   (default 20, max 20)

        EXAMPLES
          DijiPeople.ZkTeco.Worker.exe --test --host 192.168.18.53 --port 4370 ^
              --machine-number 1 --comm-key 0

          DijiPeople.ZkTeco.Worker.exe --capabilities

          DijiPeople.ZkTeco.Worker.exe --capabilities --method ReadLastestLogData

          DijiPeople.ZkTeco.Worker.exe --capabilities --output sdk-capabilities.json

          DijiPeople.ZkTeco.Worker.exe --poc --host 192.168.18.53 --port 4370 ^
              --machine-number 1 --comm-key 0 --max-users 100 --max-attendance 200 ^
              --output k50-poc.json

        This tool is strictly read-only. It never reads biometric data, never
        retains device passwords, and never modifies the device.
        """;

    public WorkerMode Mode { get; private set; } = WorkerMode.Poc;

    public string Host { get; private set; } = string.Empty;
    public int Port { get; private set; } = 4370;
    public int MachineNumber { get; private set; } = 1;
    public int CommKey { get; private set; }
    public int MaxUsers { get; private set; } = 100_000;
    public int MaxAttendance { get; private set; } = 1_000_000;

    public string? OutputPath { get; private set; }
    public bool JsonToStdout { get; private set; }
    public string? MethodFilter { get; private set; }

    /// <summary>Opt-in experiment; see ZkemAdapter.ProbeLatestLog.</summary>
    public bool ProbeLatestLog { get; private set; }
    public int ProbeLimit { get; private set; } = 20;

    private bool? _skipUsers;
    private bool? _skipAttendance;
    private bool? _skipCapabilities;

    /// <summary>Capability inspection reads type metadata; it needs no device session.</summary>
    public bool RequiresConnection => Mode != WorkerMode.Capabilities;

    public bool ReadCapabilities =>
        _skipCapabilities != true && Mode is WorkerMode.Poc or WorkerMode.Capabilities;

    public bool ReadDeviceInfo => Mode != WorkerMode.Capabilities;

    public bool ReadUsers =>
        _skipUsers != true && Mode is WorkerMode.Poc or WorkerMode.Users;

    public bool ReadAttendance =>
        _skipAttendance != true && Mode is WorkerMode.Poc or WorkerMode.Attendance;

    public static WorkerOptions Parse(string[] args)
    {
        var options = new WorkerOptions();
        WorkerMode? explicitMode = null;

        void SetMode(WorkerMode mode, string token)
        {
            if (explicitMode is not null && explicitMode != mode)
            {
                throw new WorkerException(
                    "CONFIG_INVALID",
                    $"More than one mode was given ('{explicitMode.ToString()!.ToLowerInvariant()}' and '{token}'). Pick one.");
            }
            explicitMode = mode;
            options.Mode = mode;
        }

        for (var index = 0; index < args.Length; index++)
        {
            var token = args[index];
            string Next(string name)
            {
                if (index + 1 >= args.Length)
                {
                    throw new WorkerException("CONFIG_INVALID", $"{name} requires a value.");
                }
                return args[++index];
            }

            switch (token)
            {
                // --- modes ---
                case "--poc":
                    SetMode(WorkerMode.Poc, token);
                    break;
                case "--test":
                    SetMode(WorkerMode.Test, token);
                    break;
                case "--capabilities":
                    SetMode(WorkerMode.Capabilities, token);
                    break;
                case "--device-info":
                    SetMode(WorkerMode.DeviceInfo, token);
                    break;
                case "--users":
                    SetMode(WorkerMode.Users, token);
                    break;
                case "--attendance":
                    SetMode(WorkerMode.Attendance, token);
                    break;

                // --- device ---
                case "--host":
                    options.Host = Next(token);
                    break;
                case "--port":
                    options.Port = ParseInt(token, Next(token), 1, 65535);
                    break;
                case "--machine-number":
                    options.MachineNumber = ParseInt(token, Next(token), 0, 255);
                    break;
                case "--comm-key":
                    options.CommKey = ParseInt(token, Next(token), 0, 999999);
                    break;

                // --- limits ---
                case "--max-users":
                    options.MaxUsers = ParseInt(token, Next(token), 1, 10_000_000);
                    break;
                case "--max-attendance":
                    options.MaxAttendance = ParseInt(token, Next(token), 1, 10_000_000);
                    break;

                // --- output ---
                case "--output":
                    options.OutputPath = Next(token);
                    break;
                case "--json":
                    options.JsonToStdout = true;
                    break;
                case "--method":
                    options.MethodFilter = Next(token);
                    break;

                // --- modifiers ---
                case "--skip-users":
                    options._skipUsers = true;
                    break;
                case "--skip-attendance":
                    options._skipAttendance = true;
                    break;
                case "--skip-capabilities":
                    options._skipCapabilities = true;
                    break;

                // --- opt-in experiment ---
                case "--probe-latest-log":
                    options.ProbeLatestLog = true;
                    break;
                case "--probe-limit":
                    // Hard ceiling of 20: the probe is an experiment on a
                    // production terminal and must stay minimal.
                    options.ProbeLimit = ParseInt(token, Next(token), 1, 20);
                    break;

                default:
                    throw new WorkerException("CONFIG_INVALID", $"Unknown argument '{token}'.");
            }
        }

        if (options.RequiresConnection && string.IsNullOrWhiteSpace(options.Host))
        {
            throw new WorkerException(
                "CONFIG_INVALID",
                $"--host is required for --{options.Mode.ToString().ToLowerInvariant()}. " +
                "(--capabilities is the only mode that does not contact the device.)");
        }

        if (options.ProbeLatestLog && !options.RequiresConnection)
        {
            throw new WorkerException(
                "CONFIG_INVALID",
                "--probe-latest-log needs a device connection and cannot be combined with --capabilities. " +
                "Capability inspection never invokes ReadLastestLogData.");
        }

        if (options.MethodFilter is not null && options.Mode != WorkerMode.Capabilities)
        {
            throw new WorkerException("CONFIG_INVALID", "--method only applies to --capabilities.");
        }

        return options;
    }

    private static int ParseInt(string name, string value, int min, int max)
    {
        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
        {
            throw new WorkerException("CONFIG_INVALID", $"{name} expects an integer, got '{value}'.");
        }
        if (parsed < min || parsed > max)
        {
            throw new WorkerException("CONFIG_INVALID", $"{name} must be between {min} and {max}, got {parsed}.");
        }
        return parsed;
    }
}
