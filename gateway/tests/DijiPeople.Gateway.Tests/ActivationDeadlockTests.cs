using DijiPeople.Gateway.Cli;
using DijiPeople.Gateway.Cloud;
using DijiPeople.Gateway.Runtime;

using Xunit;

namespace DijiPeople.Gateway.Tests;

/// <summary>
/// The first move, and the two ways it used to be impossible.
///
/// BUG-2732: DijiPeople would not activate an integration until a device had
/// reported VERIFIED, and this gateway would not touch a device belonging to an
/// integration that was not active. Both rules were individually correct and
/// together they left no opening, so no on-premise integration could ever be
/// brought live.
///
/// These cover the boundary the fix turns on. The whole loop — request, verify,
/// activate, sync — is proved end to end against the simulator; what is worth
/// pinning here is the distinction the loop depends on, because getting it
/// wrong in the other direction would let a gateway dial a terminal the tenant
/// had deliberately stood down.
/// </summary>
public class ActivationDeadlockTests
{
    private static IntegrationConfiguration Integration(string status, bool isActive) =>
        new() { Status = status, IsActive = isActive };

    [Theory]
    [InlineData("DRAFT")]
    [InlineData("UNVERIFIED")]
    [InlineData("unverified")]
    public void AnIntegrationStillBeingSetUpMayBeVerified(string status)
    {
        // These are the states where nothing has answered yet. Refusing them is
        // what closed the loop, so this is the assertion that fails without the
        // fix.
        Assert.True(GatewayWorker.AwaitsVerification(Integration(status, isActive: false)));
    }

    [Theory]
    [InlineData("DISABLED")]
    [InlineData("ERROR")]
    public void AnIntegrationThatIsNotMerelyNewMayNotBeVerified(string status)
    {
        // DISABLED is a deliberate operator decision and ERROR belongs to an
        // integration that was already live, so neither is "not set up yet".
        // A request left over from before must not reach the terminal, which
        // means opening the deadlock must not open these too.
        Assert.False(GatewayWorker.AwaitsVerification(Integration(status, isActive: false)));
    }

    [Fact]
    public void AnUnknownStatusIsTreatedAsNotEligible()
    {
        // A status this build has never heard of is a server that moved on
        // without us. Dialling a customer's hardware is the wrong default for
        // something we cannot interpret.
        Assert.False(GatewayWorker.AwaitsVerification(Integration("SOMETHING_NEW", isActive: false)));
        Assert.False(GatewayWorker.AwaitsVerification(Integration(string.Empty, isActive: false)));
    }

    /// <summary>
    /// The address repair, which is the other thing that made a first install
    /// fail — silently, and in a way that read as a bad pairing code.
    /// </summary>
    public class CloudAddressTests
    {
        [Theory]
        [InlineData("https://api.dijipeople.com", "https://api.dijipeople.com/api")]
        [InlineData("https://api.dijipeople.com/", "https://api.dijipeople.com/api")]
        [InlineData("http://127.0.0.1:4000", "http://127.0.0.1:4000/api")]
        public void ABareHostGainsTheApiPrefix(string input, string expected)
        {
            var result = GatewayCommands.NormaliseCloudBaseUrl(input, out var added);

            Assert.Equal(expected, result);
            Assert.True(added);
        }

        [Theory]
        [InlineData("https://api.dijipeople.com/api")]
        [InlineData("https://internal.example.com/dijipeople/api")]
        public void AnAddressThatAlreadyCarriesAPathIsLeftAlone(string input)
        {
            // A deployment behind a different prefix is not second-guessed.
            var result = GatewayCommands.NormaliseCloudBaseUrl(input, out var added);

            Assert.Equal(input, result);
            Assert.False(added);
        }

        [Fact]
        public void AnUnparseableAddressIsPassedThroughForValidationToReport()
        {
            // Validate() explains this far better than a guess here would.
            var result = GatewayCommands.NormaliseCloudBaseUrl("not a url", out var added);

            Assert.Equal("not a url", result);
            Assert.False(added);
        }
    }
}
