using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Identity;
using DijiPeople.Gateway.Runtime;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// Local credential storage, and what the gateway will accept from the cloud.
/// </summary>
public class IdentityStoreTests
{
    [Fact]
    public void ACredentialSurvivesARestartAndIsNeverStoredInPlaintext()
    {
        using var environment = new TestEnvironment();
        var store = new GatewayIdentityStore(environment.Paths);

        const string credential = "dpgw_thisIsNotARealCredentialValue0123456789";

        store.Save(
            new GatewayIdentity
            {
                GatewayId = "11111111-2222-3333-4444-555555555555",
                CloudBaseUrl = "https://api.example.test",
                InstallationId = Guid.NewGuid().ToString(),
                TokenPrefix = "dpgw_thisIsN",
                PairedAtUtc = DateTimeOffset.UtcNow,
            },
            credential);

        // A new instance is what the service does after a reboot.
        var reopened = new GatewayIdentityStore(environment.Paths);
        Assert.Equal(credential, reopened.ReadCredential());

        // The bytes on disk must not contain the secret.
        var onDisk = File.ReadAllBytes(environment.Paths.CredentialFile);
        Assert.DoesNotContain(
            System.Text.Encoding.UTF8.GetString(onDisk),
            credential);

        // And the readable identity file must not mention it either — that file
        // is meant to be safe to attach to a support ticket.
        var identityJson = File.ReadAllText(environment.Paths.IdentityFile);
        Assert.DoesNotContain(credential, identityJson);
        Assert.DoesNotContain("tenant", identityJson, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void TheIdentityFileRecordsNoTenant()
    {
        // Tenancy is the server's conclusion from the credential. If it were
        // stored locally, editing a file would be an attempt at changing which
        // organisation a gateway belongs to.
        var properties = typeof(GatewayIdentity).GetProperties().Select(p => p.Name).ToArray();

        Assert.DoesNotContain("TenantId", properties);
        Assert.Contains("GatewayId", properties);
        Assert.Contains("InstallationId", properties);
    }

    [Fact]
    public void RevokingLocallyRemovesTheCredentialButKeepsTheQueuedData()
    {
        using var environment = new TestEnvironment();
        var store = new GatewayIdentityStore(environment.Paths);

        store.Save(
            new GatewayIdentity { GatewayId = "g", CloudBaseUrl = "https://x" },
            "dpgw_something");

        Assert.True(store.IsPaired);
        store.ClearCredential();

        Assert.False(store.IsPaired);
        Assert.Null(store.ReadCredential());
        // The local database is untouched: punches collected before the
        // revocation are still owed to the customer.
        Assert.True(File.Exists(environment.Paths.DatabaseFile));
    }

    [Fact]
    public void AnUnpairedInstallationReportsNoCredentialRatherThanThrowing()
    {
        using var environment = new TestEnvironment();
        var store = new GatewayIdentityStore(environment.Paths);

        Assert.False(store.IsPaired);
        Assert.Null(store.ReadCredential());
        Assert.Null(store.ReadIdentity());
    }
}

/// <summary>
/// The gateway validates what the cloud sends before acting on it.
/// </summary>
public class CloudResponseValidationTests
{
    private static GatewayConfiguration Configuration(params DeviceConfiguration[] devices) =>
        new()
        {
            GatewayId = "11111111-2222-3333-4444-555555555555",
            GatewayName = "Head office",
            ConfigVersion = "abc",
            Policy = new GatewayRuntimePolicy
            {
                HeartbeatIntervalSeconds = 60,
                ConfigRefreshSeconds = 300,
                UploadBatchSize = 500,
                MaxEventsPerRequest = 5000,
                IntegrationEnabled = true,
            },
            Integrations = new List<IntegrationConfiguration>
            {
                new()
                {
                    IntegrationId = "bbbbbbbb-1111-2222-3333-444444444444",
                    Name = "Terminals",
                    ConnectorType = "zkteco-legacy-tcp",
                    MinimumIntervalMinutes = 15,
                    Devices = devices.ToList(),
                },
            },
        };

    private static DeviceConfiguration Device(
        string id = "aaaaaaaa-1111-2222-3333-444444444444",
        string? host = "192.168.18.53",
        int? port = 4370,
        int intervalMinutes = 30) =>
        new()
        {
            DeviceId = id,
            Name = "Front door",
            Host = host,
            Port = port,
            MachineNumber = 1,
            IsEnabled = true,
            SyncPolicy = new SyncPolicyConfiguration { IntervalMinutes = intervalMinutes },
        };

    [Fact]
    public void AValidConfigurationPassesUnchanged()
    {
        var configuration = Configuration(Device());
        var problems = CloudResponseValidator.Sanitise(configuration);

        Assert.Empty(problems);
        Assert.Single(configuration.Integrations[0].Devices);
    }

    [Fact]
    public void ADeviceWithNoUsableAddressIsDroppedAndTheRestKeepServing()
    {
        var configuration = Configuration(
            Device(host: "not a host!!"),
            Device(id: "cccccccc-1111-2222-3333-444444444444"));

        var problems = CloudResponseValidator.Sanitise(configuration);

        // One mistyped IP must not stop the other terminals at the site.
        Assert.Single(problems);
        Assert.Single(configuration.Integrations[0].Devices);
    }

    [Fact]
    public void AnInvalidPortIsDroppedRatherThanDialled()
    {
        var configuration = Configuration(Device(port: 0));
        var problems = CloudResponseValidator.Sanitise(configuration);

        Assert.Single(problems);
        Assert.Empty(configuration.Integrations[0].Devices);
    }

    [Fact]
    public void AnIntervalBelowTheConnectorFloorIsRaisedEvenIfTheServerSentIt()
    {
        // Defence in depth: the web app validates this and the API clamps it,
        // and the gateway still refuses to hammer a terminal that re-reads its
        // whole history on every poll.
        var configuration = Configuration(Device(intervalMinutes: 1));
        CloudResponseValidator.Sanitise(configuration);

        Assert.Equal(15, configuration.Integrations[0].Devices[0].SyncPolicy!.IntervalMinutes);
    }

    [Fact]
    public void AnAbsurdBatchSizeIsBroughtBackWithinTheEndpointsLimit()
    {
        var configuration = Configuration(Device());
        configuration.Policy.UploadBatchSize = 999_999;

        CloudResponseValidator.Sanitise(configuration);

        Assert.True(configuration.Policy.UploadBatchSize <= configuration.Policy.MaxEventsPerRequest);
    }

    [Fact]
    public void AHeartbeatIntervalOutsideTheAllowedRangeFallsBackToTheDefault()
    {
        var configuration = Configuration(Device());
        configuration.Policy.HeartbeatIntervalSeconds = 0;

        CloudResponseValidator.Sanitise(configuration);

        Assert.Equal(60, configuration.Policy.HeartbeatIntervalSeconds);
    }

    [Fact]
    public void AConfigurationNamingAnUnrecognisedGatewayIsRefusedOutright()
    {
        var configuration = Configuration(Device());
        configuration.GatewayId = "not-a-uuid";

        // There is no safe subset of "the server did not send our configuration".
        Assert.Throws<CloudException>(() => CloudResponseValidator.Sanitise(configuration));
    }

    [Fact]
    public void AnEmptyConfigurationIsRefused()
    {
        Assert.Throws<CloudException>(() => CloudResponseValidator.Sanitise(null));
    }

    [Fact]
    public void APairResponseWithoutACredibleCredentialIsRefused()
    {
        Assert.Throws<CloudException>(() =>
            CloudResponseValidator.ValidatePairResponse(new PairResponse
            {
                GatewayId = "11111111-2222-3333-4444-555555555555",
                Credential = "short",
            }));
    }
}

/// <summary>
/// Only one operation per device at a time.
/// </summary>
public class DeviceLockTests
{
    [Fact]
    public void ASecondRequestForABusyDeviceIsRefusedRatherThanQueued()
    {
        var registry = new DeviceLockRegistry();

        using var first = registry.TryAcquire("device-a");
        Assert.NotNull(first);

        // Two concurrent COM sessions against one legacy terminal is the failure
        // this prevents. Coalescing, not queueing: the second read would return
        // the same full history for nothing.
        Assert.Null(registry.TryAcquire("device-a"));
    }

    [Fact]
    public void DifferentDevicesDoNotBlockEachOther()
    {
        var registry = new DeviceLockRegistry();

        using var first = registry.TryAcquire("device-a");
        using var second = registry.TryAcquire("device-b");

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(2, registry.BusyCount);
    }

    [Fact]
    public void ReleasingMakesADeviceAvailableAgain()
    {
        var registry = new DeviceLockRegistry();

        registry.TryAcquire("device-a")!.Dispose();

        Assert.False(registry.IsBusy("device-a"));
        Assert.NotNull(registry.TryAcquire("device-a"));
    }

    [Fact]
    public void DisposingTwiceDoesNotReleaseSomeoneElsesLock()
    {
        var registry = new DeviceLockRegistry();

        var handle = registry.TryAcquire("device-a")!;
        handle.Dispose();

        var second = registry.TryAcquire("device-a");
        handle.Dispose();

        // The second holder must still hold it. A double dispose freeing another
        // caller's lock would allow exactly the concurrent session this exists
        // to prevent.
        Assert.True(registry.IsBusy("device-a"));
        Assert.NotNull(second);
    }
}
