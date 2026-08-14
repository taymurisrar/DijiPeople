using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

using DijiPeople.Gateway.Configuration;

namespace DijiPeople.Gateway.Identity;

/// <summary>
/// What this installation knows about itself.
///
/// Two files, two very different sensitivities:
///
///   gateway.identity.json  non-secret. Gateway id, cloud address, installation
///                          id, version. Safe to read, copy and attach to a
///                          support ticket.
///   credential.dat         the service credential, DPAPI-protected at machine
///                          scope and ACL'd to SYSTEM and Administrators.
///
/// TENANT IDENTITY IS NOT STORED. Nothing here records which tenant this gateway
/// belongs to, and nothing sends a tenant id to DijiPeople. The server resolves
/// tenancy from the credential every time, so editing a local file cannot move a
/// gateway between tenants or make it fetch another tenant's devices.
///
/// WHY MACHINE SCOPE. The service must start unattended after a reboot, before
/// any user logs in and possibly under a service account with no loaded profile,
/// so user-scoped DPAPI would leave the credential unreadable exactly when it is
/// needed. Machine scope plus a restrictive ACL is the standard trade for an
/// unattended Windows service. It is honest about its limit: a local
/// administrator on this machine can read the credential. That is why the
/// credential is scoped to one gateway, is revocable from the web app, and is
/// rotatable without reinstalling.
/// </summary>
public sealed class GatewayIdentityStore
{
    private readonly GatewayPaths _paths;

    /// <summary>
    /// Additional entropy mixed into the DPAPI blob. Not a secret and not
    /// pretending to be one — it stops a generic "unprotect every DPAPI blob"
    /// sweep from reading this file incidentally.
    /// </summary>
    private static readonly byte[] Entropy =
        Encoding.UTF8.GetBytes("DijiPeople.IntegrationGateway.ServiceCredential.v1");

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public GatewayIdentityStore(GatewayPaths paths)
    {
        _paths = paths;
    }

    public bool IsPaired => File.Exists(_paths.IdentityFile) && File.Exists(_paths.CredentialFile);

    public GatewayIdentity? ReadIdentity()
    {
        if (!File.Exists(_paths.IdentityFile))
        {
            return null;
        }

        try
        {
            var content = File.ReadAllText(_paths.IdentityFile);
            return JsonSerializer.Deserialize<GatewayIdentity>(content, Json);
        }
        catch (Exception exception) when (exception is JsonException or IOException)
        {
            return null;
        }
    }

    /// <summary>
    /// Returns the plaintext credential, or null when this installation is not
    /// paired or the protected blob cannot be read on this machine.
    /// </summary>
    public string? ReadCredential()
    {
        if (!File.Exists(_paths.CredentialFile))
        {
            return null;
        }

        try
        {
            var protectedBytes = File.ReadAllBytes(_paths.CredentialFile);
            var plaintext = ProtectedData.Unprotect(
                protectedBytes,
                Entropy,
                DataProtectionScope.LocalMachine);

            return Encoding.UTF8.GetString(plaintext);
        }
        catch (Exception exception) when (
            exception is CryptographicException or IOException or UnauthorizedAccessException)
        {
            // Three distinct causes, one safe answer:
            //   - the file was copied from another machine (machine-scope DPAPI
            //     deliberately does not travel);
            //   - the file is corrupt;
            //   - the caller is not permitted to read it, which is what an
            //     unelevated `status` run sees.
            // All mean "this process has no usable credential", and reporting
            // that beats crashing a service or an administrator's console.
            return null;
        }
    }

    /// <summary>
    /// Persists a freshly issued identity and credential.
    ///
    /// The credential is protected before it reaches the disk — the plaintext is
    /// never written anywhere, including to a temp file.
    /// </summary>
    public void Save(GatewayIdentity identity, string credentialPlaintext)
    {
        _paths.EnsureCreated();

        var protectedBytes = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(credentialPlaintext),
            Entropy,
            DataProtectionScope.LocalMachine);

        AtomicFile.WriteAllBytes(_paths.CredentialFile, protectedBytes);
        RestrictToAdministrators(_paths.CredentialFile);

        AtomicFile.WriteAllText(
            _paths.IdentityFile,
            JsonSerializer.Serialize(identity, Json));
    }

    /// <summary>Updates non-secret identity fields without touching the secret.</summary>
    public void UpdateIdentity(GatewayIdentity identity)
    {
        _paths.EnsureCreated();
        AtomicFile.WriteAllText(
            _paths.IdentityFile,
            JsonSerializer.Serialize(identity, Json));
    }

    /// <summary>
    /// Removes the local credential.
    ///
    /// Used when DijiPeople reports the credential revoked, and by uninstall.
    /// The local database is deliberately NOT touched: queued punches and run
    /// history stay for audit until an operator removes them explicitly.
    /// </summary>
    public void ClearCredential()
    {
        if (File.Exists(_paths.CredentialFile))
        {
            File.Delete(_paths.CredentialFile);
        }
    }

    /// <summary>
    /// Strips inherited access so ordinary users cannot read the protected
    /// credential. Machine-scope DPAPI alone would let any local account that can
    /// open the file unprotect it, so the file permission is doing real work
    /// here rather than decorating the encryption.
    ///
    /// Three principals are granted, and the third matters: SYSTEM because that
    /// is what the service runs as by default, Administrators because that is
    /// who installs and supports it, and the identity that wrote the file
    /// because a deployment may run the service under a dedicated least-privilege
    /// account. Omitting the last would lock such a service out of its own
    /// credential — and the failure would only appear after the next reboot.
    /// </summary>
    private static void RestrictToAdministrators(string path)
    {
        try
        {
            var file = new FileInfo(path);
            var security = file.GetAccessControl();

            security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);

            foreach (FileSystemAccessRule existing in security.GetAccessRules(
                         includeExplicit: true,
                         includeInherited: false,
                         typeof(SecurityIdentifier)))
            {
                security.RemoveAccessRule(existing);
            }

            var principals = new List<IdentityReference>
            {
                new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
            };

            using (var current = WindowsIdentity.GetCurrent())
            {
                if (current.User is not null)
                {
                    principals.Add(current.User);
                }
            }

            foreach (var principal in principals.Distinct())
            {
                security.AddAccessRule(new FileSystemAccessRule(
                    principal,
                    FileSystemRights.FullControl,
                    AccessControlType.Allow));
            }

            file.SetAccessControl(security);
        }
        catch (Exception exception) when (
            exception is UnauthorizedAccessException or
                         PlatformNotSupportedException or
                         IOException)
        {
            // Tightening failed (running unelevated, or a filesystem without
            // ACLs). The credential is still DPAPI-protected, so this weakens
            // defence in depth rather than exposing the secret. Left to the
            // caller to log; throwing here would abort a pairing that has
            // already succeeded server-side and burned its one-time code.
        }
    }
}

/// <summary>
/// The non-secret half of a gateway's identity.
///
/// TenantId is absent by design — see the class remarks on
/// <see cref="GatewayIdentityStore"/>.
/// </summary>
public sealed class GatewayIdentity
{
    public string GatewayId { get; set; } = string.Empty;

    /// <summary>DijiPeople API base this gateway was paired against.</summary>
    public string CloudBaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Stable id for this installation, generated once at pairing. Lets
    /// DijiPeople tell "same machine reconnecting" from "reinstalled and
    /// re-paired" without inspecting anything identifying about the machine.
    /// </summary>
    public string InstallationId { get; set; } = string.Empty;

    /// <summary>Non-secret leading segment of the credential, for support.</summary>
    public string? TokenPrefix { get; set; }

    public DateTimeOffset PairedAtUtc { get; set; }

    /// <summary>Gateway version at the time of pairing; refreshed on upgrade.</summary>
    public string? Version { get; set; }
}
