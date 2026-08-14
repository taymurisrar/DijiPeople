namespace DijiPeople.Gateway.Configuration;

/// <summary>
/// Where the gateway keeps its state on the customer machine.
///
/// Everything writable lives under ProgramData, not under the install folder.
/// That separation is what lets an upgrade replace the binaries wholesale
/// without touching the paired credential, the local queue or the logs — and it
/// is why the service does not need write access to Program Files at runtime.
/// </summary>
public sealed class GatewayPaths
{
    public const string ProductFolder = @"DijiPeople\IntegrationGateway";

    public GatewayPaths(string? rootOverride = null)
    {
        Root = rootOverride ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            ProductFolder);

        DataDirectory = Path.Combine(Root, "data");
        LogDirectory = Path.Combine(Root, "logs");
        DiagnosticsDirectory = Path.Combine(Root, "diagnostics");

        SettingsFile = Path.Combine(Root, "gateway.settings.json");
        IdentityFile = Path.Combine(Root, "gateway.identity.json");
        // Deliberately its own file rather than a field in the identity JSON:
        // the identity file is safe to read, copy and attach to a support
        // ticket, and it must stay that way.
        CredentialFile = Path.Combine(Root, "credential.dat");
        DatabaseFile = Path.Combine(DataDirectory, "gateway.db");
    }

    public string Root { get; }
    public string DataDirectory { get; }
    public string LogDirectory { get; }
    public string DiagnosticsDirectory { get; }
    public string SettingsFile { get; }
    public string IdentityFile { get; }
    public string CredentialFile { get; }
    public string DatabaseFile { get; }

    /// <summary>The folder the gateway executable itself was installed into.</summary>
    public static string InstallDirectory =>
        AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);

    public void EnsureCreated()
    {
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(LogDirectory);
        Directory.CreateDirectory(DiagnosticsDirectory);
    }
}
