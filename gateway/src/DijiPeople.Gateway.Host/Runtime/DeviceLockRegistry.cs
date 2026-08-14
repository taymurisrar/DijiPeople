using System.Collections.Concurrent;

namespace DijiPeople.Gateway.Runtime;

/// <summary>
/// One in-flight operation per device.
///
/// Two COM sessions against the same terminal at once is the failure this
/// prevents: legacy ZKTeco units do not enjoy concurrent access, and a manual
/// "sync now" arriving while a scheduled poll is already running is the obvious
/// way to cause it. The lock coalesces rather than queues — a second request for
/// a device that is already syncing is dropped, because running the identical
/// full-history read again immediately afterwards would produce nothing new.
///
/// This is per-device and is separate from the gateway-wide concurrency limit.
/// Two different devices may sync at once if the configuration allows it; the
/// same device never does.
/// </summary>
public sealed class DeviceLockRegistry
{
    private readonly ConcurrentDictionary<string, byte> _busy = new(StringComparer.Ordinal);

    /// <summary>
    /// Takes the lock, or returns null when the device is already busy.
    /// Callers must dispose the handle — a leaked lock would stop a device
    /// syncing until the service restarted.
    /// </summary>
    public IDisposable? TryAcquire(string deviceId)
    {
        if (!_busy.TryAdd(deviceId, 0))
        {
            return null;
        }

        return new Handle(this, deviceId);
    }

    public bool IsBusy(string deviceId) => _busy.ContainsKey(deviceId);

    public int BusyCount => _busy.Count;

    private void Release(string deviceId) => _busy.TryRemove(deviceId, out _);

    private sealed class Handle : IDisposable
    {
        private readonly DeviceLockRegistry _registry;
        private readonly string _deviceId;
        private bool _released;

        public Handle(DeviceLockRegistry registry, string deviceId)
        {
            _registry = registry;
            _deviceId = deviceId;
        }

        public void Dispose()
        {
            if (_released) return;
            _released = true;
            _registry.Release(_deviceId);
        }
    }
}
