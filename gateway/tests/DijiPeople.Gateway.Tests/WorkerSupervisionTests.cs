using DijiPeople.Gateway.Connectors.ZkTeco;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// The gateway treats its worker as untrusted.
///
/// These run a real child process, because the failures that matter — a hang, a
/// crash, a flood of output — only exist at the process boundary. A mocked
/// supervisor would prove nothing about whether a hung COM call actually gets
/// killed on a customer's machine at three in the morning.
/// </summary>
public class WorkerSupervisionTests
{
    private static ZkTecoWorkerClient Client(
        TimeSpan? timeout = null,
        int maxOutputBytes = 8 * 1024 * 1024) =>
        new(FakeWorker.Path,
            timeout ?? TimeSpan.FromSeconds(30),
            maxOutputBytes,
            TestLogger.For<ZkTecoWorkerClient>());

    private static readonly string[] DeviceArguments =
    {
        "--attendance", "--host", "192.168.18.53", "--port", "4370", "--machine-number", "1",
    };

    [Fact]
    public async Task AHungWorkerIsKilledAndReportedRatherThanWaitedOnForever()
    {
        using var _ = FakeWorker.Mode("hang");

        var client = Client(timeout: TimeSpan.FromSeconds(2));
        var invocation = await client.InvokeAsync(DeviceArguments, CancellationToken.None);

        Assert.False(invocation.Succeeded);
        Assert.Equal("WORKER_TIMEOUT", invocation.ErrorCode);
    }

    [Fact]
    public async Task ACrashedWorkerBecomesADeviceFailureNotAServiceFailure()
    {
        using var _ = FakeWorker.Mode("crash");

        var invocation = await Client().InvokeAsync(DeviceArguments, CancellationToken.None);

        Assert.False(invocation.Succeeded);
        Assert.NotNull(invocation.ErrorCode);
    }

    [Fact]
    public async Task MalformedOutputIsRejectedRatherThanPartiallyParsed()
    {
        using var _ = FakeWorker.Mode("garbage");

        var invocation = await Client().InvokeAsync(DeviceArguments, CancellationToken.None);

        Assert.False(invocation.Succeeded);
        Assert.Equal("WORKER_MALFORMED_OUTPUT", invocation.ErrorCode);
    }

    [Fact]
    public async Task OutputBeyondTheCeilingIsRefusedWithoutBufferingItAll()
    {
        using var _ = FakeWorker.Mode("huge");

        // A 1 MB ceiling against a worker that emits 256 MB.
        var client = Client(maxOutputBytes: 1024 * 1024);
        var invocation = await client.InvokeAsync(DeviceArguments, CancellationToken.None);

        Assert.False(invocation.Succeeded);
        Assert.Equal("WORKER_OUTPUT_TOO_LARGE", invocation.ErrorCode);
    }

    [Fact]
    public async Task AWorkerSpeakingADifferentContractIsRefused()
    {
        using var _ = FakeWorker.Mode("wrong-contract");

        var invocation = await Client().InvokeAsync(DeviceArguments, CancellationToken.None);

        Assert.False(invocation.Succeeded);
        Assert.Equal("WORKER_CONTRACT_MISMATCH", invocation.ErrorCode);

        // Misreading a mismatched contract would produce plausible-looking
        // punches, which is far worse than a failed sync.
    }

    [Fact]
    public async Task A64BitWorkerIsRefusedBecauseItCannotHaveReachedTheDevice()
    {
        using var _ = FakeWorker.Mode("x64");

        var invocation = await Client().InvokeAsync(DeviceArguments, CancellationToken.None);

        Assert.False(invocation.Succeeded);
        Assert.Equal("WORKER_ARCHITECTURE_MISMATCH", invocation.ErrorCode);
    }

    [Fact]
    public async Task AMissingWorkerIsReportedClearly()
    {
        var client = new ZkTecoWorkerClient(
            Path.Combine(Path.GetTempPath(), "does-not-exist", "worker.exe"),
            TimeSpan.FromSeconds(5),
            1024,
            TestLogger.For<ZkTecoWorkerClient>());

        var invocation = await client.InvokeAsync(DeviceArguments, CancellationToken.None);

        Assert.False(invocation.Succeeded);
        Assert.Equal("WORKER_MISSING", invocation.ErrorCode);
    }

    [Fact]
    public async Task AWorkerThatRejectsItsArgumentsIsReportedAsAGatewayFault()
    {
        using var _ = FakeWorker.Mode("usage");

        var invocation = await Client().InvokeAsync(DeviceArguments, CancellationToken.None);

        Assert.False(invocation.Succeeded);
        Assert.Equal("WORKER_USAGE_ERROR", invocation.ErrorCode);
    }

    [Fact]
    public void TheCommKeyIsMaskedBeforeAnArgumentListIsLogged()
    {
        var redacted = ZkTecoWorkerClient.Redact(new[]
        {
            "--attendance", "--host", "192.168.18.53", "--comm-key", "123456", "--json",
        });

        Assert.DoesNotContain("123456", redacted);
        Assert.Contains("***", redacted);
        // The address is not a secret and stays readable, which is what makes
        // the log useful for diagnosing the connection.
        Assert.Contains("192.168.18.53", redacted);
    }

    [Fact]
    public async Task AWorkerThatFailsDoesNotPreventTheNextInvocation()
    {
        // One bad device must not poison the process for the next one.
        using (FakeWorker.Mode("crash"))
        {
            var failed = await Client().InvokeAsync(DeviceArguments, CancellationToken.None);
            Assert.False(failed.Succeeded);
        }

        using (FakeWorker.Mode("attendance"))
        {
            var succeeded = await Client().InvokeAsync(DeviceArguments, CancellationToken.None);
            Assert.True(succeeded.Succeeded);
        }
    }
}
