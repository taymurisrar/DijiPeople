namespace DijiPeople.Gateway.Connectors;

/// <summary>
/// Resolves an adapter by connector type.
///
/// This is the reason the scheduler contains no `if (provider == "ZKTECO")`.
/// An integration whose connector this build has no adapter for resolves to
/// nothing and is skipped with a clear message, rather than being handled by
/// whichever branch happened to fall through.
/// </summary>
public sealed class ConnectorRegistry
{
    private readonly Dictionary<string, IGatewayAttendanceConnector> _byType;

    public ConnectorRegistry(IEnumerable<IGatewayAttendanceConnector> connectors)
    {
        _byType = connectors.ToDictionary(
            connector => connector.ConnectorType,
            StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyCollection<string> SupportedConnectorTypes => _byType.Keys;

    public IGatewayAttendanceConnector? Find(string connectorType) =>
        _byType.GetValueOrDefault(connectorType);

    /// <summary>
    /// Capability flags this gateway build reports at pairing and heartbeat, so
    /// the web app can tell an administrator what an installed gateway can do
    /// without probing it.
    /// </summary>
    public string[] DescribeCapabilities() =>
        _byType.Values
            .SelectMany(connector => connector.Capabilities.Select(
                capability => $"{connector.ConnectorType}:{capability}"))
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToArray();
}
