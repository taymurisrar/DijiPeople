using DijiPeople.Gateway.Connectors;
using DijiPeople.Gateway.Connectors.ZkTeco;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// The ZKTeco adapter's contract with the rest of the gateway.
/// </summary>
public class ZkTecoConnectorTests
{
    private static ZkTecoLegacyConnector Connector() =>
        new(new ZkTecoWorkerClient(
                FakeWorker.Path,
                TimeSpan.FromSeconds(30),
                32 * 1024 * 1024,
                TestLogger.For<ZkTecoWorkerClient>()),
            TestLogger.For<ZkTecoLegacyConnector>());

    private static ConnectorDeviceContext Context(
        IReadOnlyDictionary<string, object?>? configuration = null) =>
        new()
        {
            DeviceId = "aaaaaaaa-1111-2222-3333-444444444444",
            DeviceName = "Front door",
            IntegrationId = "bbbbbbbb-1111-2222-3333-444444444444",
            Host = "192.168.18.53",
            Port = 4370,
            MachineNumber = 1,
            ExpectedSerialNumber = "A2QO221160250",
            Timezone = "Asia/Karachi",
            Configuration = configuration ?? new Dictionary<string, object?>(),
        };

    [Fact]
    public async Task VerifyReportsTheTerminalIdentityAndItsOwnClock()
    {
        using var _ = FakeWorker.Mode("device-info", deviceTime: "2026-08-14T19:10:43");

        var result = await Connector().VerifyDeviceAsync(Context(), CancellationToken.None);

        Assert.True(result.Connected);
        Assert.Equal("A2QO221160250", result.SerialNumber);
        Assert.Equal("K50", result.Model);
        Assert.Equal("ZLM60_TFT", result.Platform);
        // Kept exactly as the terminal stated it: no Z, no offset, no conversion.
        Assert.Equal("2026-08-14T19:10:43", result.DeviceTimeLocal);
        Assert.DoesNotContain("Z", result.DeviceTimeLocal!);
    }

    [Fact]
    public async Task AnUnreachableDeviceIsReportedRatherThanThrown()
    {
        using var _ = FakeWorker.Mode("device-unreachable");

        var result = await Connector().VerifyDeviceAsync(Context(), CancellationToken.None);

        Assert.False(result.Connected);
        Assert.Equal("DEVICE_UNREACHABLE", result.ErrorCode);
    }

    [Fact]
    public async Task DiscoveryReturnsIdentityFieldsAndDropsUnusableRows()
    {
        using var _ = FakeWorker.Mode("users");

        var result = await Connector().DiscoverUsersAsync(Context(), CancellationToken.None);

        Assert.True(result.Succeeded);
        // The third fixture row has a blank identifier: not a person we can map.
        Assert.Equal(2, result.Users.Count);
        Assert.Contains(result.Users, user => user.ExternalUserId == "1" && user.Name == "Ayesha Khan");

        // The DiscoveredUser record has no password or biometric member at all,
        // so nothing of that kind could be carried even by a malicious worker.
        Assert.Equal(
            new[] { "ExternalUserId", "Name", "PrivilegeRaw", "Enabled" },
            typeof(DiscoveredUser).GetProperties()
                .Where(property => property.Name != "EqualityContract")
                .Select(property => property.Name)
                .ToArray());
    }

    [Fact]
    public async Task AttendanceIsFingerprintedWithTheDeviceSerialAndMalformedRowsAreDropped()
    {
        using var _ = FakeWorker.Mode("attendance", deviceTime: "2026-08-14T12:00:00");

        var result = await Connector().ReadAttendanceAsync(Context(), CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal("A2QO221160250", result.SerialNumber);

        // Four usable punches; the fixture's fifth has no timestamp and is
        // dropped rather than given an invented one.
        Assert.Equal(4, result.Punches.Count);
        Assert.All(result.Punches, punch => Assert.NotEmpty(punch.Fingerprint));
        Assert.All(result.Punches, punch => Assert.DoesNotContain("Z", punch.OccurredAtLocal));

        var expected = EventFingerprint.Compute(
            "A2QO221160250", "1", "2022-10-24T08:01:12", 1, 0, 0);
        Assert.Contains(result.Punches, punch => punch.Fingerprint == expected);
    }

    [Fact]
    public void TheAdapterDoesNotAdvertiseWriteBackUntilItIsProvenOnHardware()
    {
        var capabilities = Connector().Capabilities;

        Assert.Contains("READ_ATTENDANCE", capabilities);
        Assert.Contains("READ_USERS", capabilities);
        // Declared in the API's connector metadata as experimental, and
        // deliberately not offered by the runtime adapter, so the scheduler
        // cannot reach it.
        Assert.DoesNotContain("WRITE_USERS", capabilities);
        Assert.DoesNotContain("UPDATE_USERS", capabilities);
        Assert.DoesNotContain("DISABLE_USERS", capabilities);
    }

    [Fact]
    public async Task ProvisioningIsRefusedRatherThanAttempted()
    {
        var result = await Connector().ProvisionUserAsync(
            Context(),
            new Cloud.ProvisioningJobPayload
            {
                ExternalUserId = "99",
                EmployeeCode = "EMP0099",
                DisplayName = "Test Person",
                Enabled = true,
            },
            "CREATE_USER",
            CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal("WRITE_NOT_CERTIFIED", result.ErrorCode);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(123456, 123456)]
    public void TheCommKeyIsReadFromANumber(object stored, int expected)
    {
        var configuration = new Dictionary<string, object?> { ["commKey"] = stored };
        Assert.Equal(expected, ZkTecoLegacyConnector.ReadCommKey(configuration));
    }

    [Fact]
    public void TheCommKeyIsReadWhenItRoundTrippedThroughJsonAsAString()
    {
        // Secrets are stored as encrypted JSON, so a number can come back quoted.
        var configuration = new Dictionary<string, object?> { ["commKey"] = "4321" };
        Assert.Equal(4321, ZkTecoLegacyConnector.ReadCommKey(configuration));
    }

    [Fact]
    public void AnUnreadableCommKeyMeansNoKeyRatherThanGarbage()
    {
        var configuration = new Dictionary<string, object?> { ["commKey"] = "not-a-number" };
        Assert.Equal(0, ZkTecoLegacyConnector.ReadCommKey(configuration));
    }
}
