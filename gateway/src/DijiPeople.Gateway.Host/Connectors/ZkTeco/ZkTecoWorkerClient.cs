using System.Diagnostics;
using System.Text;
using System.Text.Json;

using Microsoft.Extensions.Logging;

namespace DijiPeople.Gateway.Connectors.ZkTeco;

/// <summary>
/// Supervises the x86 ZKTeco worker.
///
/// The worker is a separate short-lived process for two reasons, and only the
/// first is about architecture:
///
///   1. zkemkeeper is 32-bit COM. Hosting it in-process would force the entire
///      gateway to x86 and inflict that on every future connector.
///   2. A crashed COM call cannot take the service down, and a hung one cannot
///      hold a device session open — the process dies and the session dies with
///      it. A long-lived in-process COM client has no equivalent guarantee.
///
/// Everything below treats the worker as untrusted output: bounded stdout,
/// bounded stderr, a hard timeout, exit-code checks, contract-version checks and
/// an architecture assertion. A malformed or runaway worker degrades one device
/// sync, never the gateway.
/// </summary>
internal sealed class ZkTecoWorkerClient
{
    private readonly string _workerPath;
    private readonly TimeSpan _timeout;
    private readonly int _maxOutputBytes;
    private readonly ILogger<ZkTecoWorkerClient> _logger;

    /// <summary>stderr is diagnostics only, so it gets a much tighter cap.</summary>
    private const int MaxErrorBytes = 256 * 1024;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public ZkTecoWorkerClient(
        string workerPath,
        TimeSpan timeout,
        int maxOutputBytes,
        ILogger<ZkTecoWorkerClient> logger)
    {
        _workerPath = workerPath;
        _timeout = timeout;
        _maxOutputBytes = maxOutputBytes;
        _logger = logger;
    }

    public bool IsAvailable => File.Exists(_workerPath);

    public string WorkerPath => _workerPath;

    /// <summary>
    /// Runs one worker invocation and returns its validated result.
    ///
    /// <paramref name="arguments"/> is built by the caller from the device
    /// configuration; --json is always appended here so no caller can
    /// accidentally invoke a mode that prints a human report the parser would
    /// then choke on.
    /// </summary>
    public async Task<WorkerInvocation> InvokeAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken)
    {
        if (!IsAvailable)
        {
            return WorkerInvocation.Failed(
                "WORKER_MISSING",
                $"The ZKTeco worker was not found at {_workerPath}.");
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = _workerPath,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = false,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(_workerPath) ?? Environment.CurrentDirectory,
            StandardOutputEncoding = new UTF8Encoding(false),
            StandardErrorEncoding = new UTF8Encoding(false),
        };

        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        // Machine mode, always. The comm key travels in the argument list, which
        // is why the redacted form is what gets logged.
        startInfo.ArgumentList.Add("--json");

        _logger.LogDebug(
            "Starting ZKTeco worker: {Arguments}",
            Redact(startInfo.ArgumentList));

        using var process = new Process { StartInfo = startInfo };

        var stopwatch = Stopwatch.StartNew();

        try
        {
            process.Start();
        }
        catch (Exception exception)
        {
            return WorkerInvocation.Failed(
                "WORKER_START_FAILED",
                $"The ZKTeco worker could not be started: {exception.Message}");
        }

        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(_timeout);

        // Overflow has to interrupt the wait, not merely be discovered after it.
        // Once the reader stops draining stdout the pipe fills and the worker
        // blocks on its next write, so a runaway process would otherwise sit
        // there until the timeout — turning a fast, precise rejection into a
        // ten-minute stall on a device that is not even faulty.
        using var overflowSource = new CancellationTokenSource();
        using var waitSource = CancellationTokenSource.CreateLinkedTokenSource(
            timeoutSource.Token,
            overflowSource.Token);

        var stdoutTask = ReadBoundedAsync(
            process.StandardOutput, _maxOutputBytes, timeoutSource.Token, overflowSource);
        var stderrTask = ReadBoundedAsync(
            process.StandardError, MaxErrorBytes, timeoutSource.Token, overflow: null);

        var overflowed = false;

        try
        {
            await process.WaitForExitAsync(waitSource.Token);
        }
        catch (OperationCanceledException)
        {
            Terminate(process);

            if (cancellationToken.IsCancellationRequested)
            {
                // The service is shutting down. Not a device fault.
                throw new OperationCanceledException(cancellationToken);
            }

            if (!overflowSource.IsCancellationRequested)
            {
                return WorkerInvocation.Failed(
                    "WORKER_TIMEOUT",
                    $"The ZKTeco worker did not finish within {_timeout.TotalSeconds:F0} seconds and was stopped.");
            }

            overflowed = true;
        }

        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        stopwatch.Stop();

        if (overflowed || stdout.Truncated)
        {
            // A worker producing more than the cap is either broken or reading
            // something it should not be. Its output is not parsed at all.
            Terminate(process);
            return WorkerInvocation.Failed(
                "WORKER_OUTPUT_TOO_LARGE",
                $"The ZKTeco worker produced more than {_maxOutputBytes / (1024 * 1024)} MB of output and was rejected.");
        }

        if (!string.IsNullOrWhiteSpace(stderr.Text))
        {
            _logger.LogDebug("ZKTeco worker trace: {Trace}", Truncate(stderr.Text, 4000));
        }

        // Exit code 2 is a usage error: the gateway built a command line the
        // worker rejects, which is a gateway bug, not a device problem.
        if (process.ExitCode == 2)
        {
            return WorkerInvocation.Failed(
                "WORKER_USAGE_ERROR",
                "The ZKTeco worker rejected the arguments it was given.");
        }

        WorkerResult? result;
        try
        {
            result = JsonSerializer.Deserialize<WorkerResult>(stdout.Text, Json);
        }
        catch (JsonException exception)
        {
            return WorkerInvocation.Failed(
                "WORKER_MALFORMED_OUTPUT",
                $"The ZKTeco worker returned output this gateway could not read: {exception.Message}");
        }

        if (result is null)
        {
            return WorkerInvocation.Failed(
                "WORKER_MALFORMED_OUTPUT",
                "The ZKTeco worker returned an empty result.");
        }

        if (result.ContractVersion != WorkerResult.SupportedContractVersion)
        {
            return WorkerInvocation.Failed(
                "WORKER_CONTRACT_MISMATCH",
                $"The ZKTeco worker speaks contract version {result.ContractVersion}; this gateway understands {WorkerResult.SupportedContractVersion}. Reinstall the gateway package so the two match.");
        }

        // Third independent x86 guard, after the project file and the worker's
        // own assertion. A 64-bit worker cannot have reached zkemkeeper, so
        // whatever it reported did not come from the terminal.
        if (result.Runtime?.Is64BitProcess == true)
        {
            return WorkerInvocation.Failed(
                "WORKER_ARCHITECTURE_MISMATCH",
                "The ZKTeco worker ran as a 64-bit process and cannot have reached the terminal's 32-bit SDK.");
        }

        return new WorkerInvocation(
            Succeeded: result.Error is null,
            Result: result,
            ErrorCode: result.Error?.Code,
            ErrorMessage: result.Error?.Message,
            DurationMs: (int)stopwatch.ElapsedMilliseconds);
    }

    /// <summary>
    /// Kills a worker that overran, and its children.
    ///
    /// Best effort by necessity: the process may have exited between the timeout
    /// firing and this call, and failing to kill an already-dead process must
    /// not turn a device timeout into a gateway exception.
    /// </summary>
    private void Terminate(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
        }
        catch (Exception exception) when (
            exception is InvalidOperationException or NotSupportedException or
                         System.ComponentModel.Win32Exception)
        {
            _logger.LogWarning(
                "A ZKTeco worker process could not be stopped cleanly: {Reason}",
                exception.Message);
        }
    }

    /// <summary>
    /// Reads a stream up to a byte ceiling.
    ///
    /// ReadToEndAsync would happily buffer whatever a broken worker emitted.
    /// Stopping at the cap keeps a runaway process from exhausting the service's
    /// memory on a customer machine nobody is watching.
    /// </summary>
    private static async Task<BoundedRead> ReadBoundedAsync(
        StreamReader reader,
        int maxBytes,
        CancellationToken cancellationToken,
        CancellationTokenSource? overflow)
    {
        var builder = new StringBuilder();
        var buffer = new char[16 * 1024];
        var total = 0;

        try
        {
            while (true)
            {
                var read = await reader.ReadAsync(buffer, cancellationToken);
                if (read == 0) break;

                total += read;
                if (total > maxBytes)
                {
                    // Signals the caller to stop waiting and kill the process,
                    // rather than leaving it blocked on a pipe nobody is reading.
                    overflow?.Cancel();
                    return new BoundedRead(builder.ToString(), Truncated: true);
                }

                builder.Append(buffer, 0, read);
            }
        }
        catch (OperationCanceledException)
        {
            // The caller already handles the timeout; whatever arrived so far is
            // returned so a diagnostic line is still available.
            return new BoundedRead(builder.ToString(), Truncated: false);
        }
        catch (IOException)
        {
            // The pipe closed under us because the process was killed.
            return new BoundedRead(builder.ToString(), Truncated: false);
        }

        return new BoundedRead(builder.ToString(), Truncated: false);
    }

    /// <summary>
    /// Masks the comm key before an argument list reaches a log file.
    ///
    /// The key is a device secret. It has to be on the command line because that
    /// is the worker's interface, but it must never be readable afterwards in a
    /// log a support engineer might attach to a ticket.
    /// </summary>
    internal static string Redact(IEnumerable<string> arguments)
    {
        var parts = new List<string>();
        var maskNext = false;

        foreach (var argument in arguments)
        {
            if (maskNext)
            {
                parts.Add("***");
                maskNext = false;
                continue;
            }

            parts.Add(argument);
            maskNext = string.Equals(argument, "--comm-key", StringComparison.Ordinal);
        }

        return string.Join(' ', parts);
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";

    private readonly record struct BoundedRead(string Text, bool Truncated);
}

/// <summary>One worker run: either a validated result, or a reason it is not usable.</summary>
internal sealed record WorkerInvocation(
    bool Succeeded,
    WorkerResult? Result,
    string? ErrorCode,
    string? ErrorMessage,
    int DurationMs)
{
    internal static WorkerInvocation Failed(string code, string message) =>
        new(false, null, code, message, 0);
}
