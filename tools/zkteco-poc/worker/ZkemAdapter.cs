using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

namespace DijiPeople.ZkTeco.Worker;

/// <summary>
/// Narrow read-only adapter over the zkemkeeper COM component.
///
/// The raw COM object never leaves this class — callers see only the DTOs in
/// Contract.cs. Every SDK call goes through <see cref="Invoke"/> and
/// <see cref="InvokeByRef"/>, which refuse any method that is not on
/// <see cref="AllowedMethods"/>. That allowlist is the enforcement point for the
/// read-only requirement: ClearGLog, ClearData, SSR_SetUserInfo, SetDeviceTime,
/// RestartDevice, PowerOffDevice, EnableDevice and every other mutating or
/// biometric API is absent, so calling one throws before it reaches the device.
/// </summary>
internal sealed class ZkemAdapter : IDisposable
{
    public const string ProgId = "zkemkeeper.ZKEM.1";
    public const string ExpectedClsid = "{00853A19-BD51-419B-9269-2DABE57EB61F}";

    /// <summary>
    /// The complete set of SDK methods this POC is permitted to call. Every entry
    /// is read-only apart from SetCommPassword, which configures the *client's*
    /// communication key before connecting and writes nothing to the device — and
    /// which is skipped entirely when the comm key is 0, as it is on the K50.
    /// </summary>
    private static readonly HashSet<string> AllowedMethods = new(StringComparer.Ordinal)
    {
        "SetCommPassword",
        "Connect_Net",
        "Disconnect",
        "GetLastError",
        "GetSerialNumber",
        "GetProductCode",
        "GetFirmwareVersion",
        "GetPlatform",
        "GetDeviceMAC",
        "GetVendor",
        "GetDeviceTime",
        "GetDeviceStatus",
        "ReadAllUserID",
        "SSR_GetAllUserInfo",
        "ReadGeneralLogData",
        "SSR_GetGeneralLogData",
    };

    /// <summary>
    /// Methods reachable ONLY when the operator explicitly opts in with
    /// --probe-latest-log. They are kept out of <see cref="AllowedMethods"/> so
    /// that a default POC run provably cannot reach them, however the code
    /// changes around them.
    ///
    /// ReadLastestLogData is here rather than in the allowlist because its side
    /// effects are unknown: COM type information describes a calling convention,
    /// not behaviour, so nothing we can read proves it does not advance a
    /// device-side read marker shared with the customer's V2011 software.
    /// </summary>
    private static readonly HashSet<string> ProbeOnlyMethods = new(StringComparer.Ordinal)
    {
        "ReadLastestLogData",
    };

    private readonly WorkerOptions _options;
    private readonly Action<string> _trace;
    private object? _com;
    private bool _connected;

    private ZkemAdapter(object com, WorkerOptions options, Action<string> trace)
    {
        _com = com;
        _options = options;
        _trace = trace;
    }

    private object Com => _com ?? throw new ObjectDisposedException(nameof(ZkemAdapter));

    // ---------------------------------------------------------------- creation

    public static ZkemAdapter Create(WorkerOptions options, Action<string> trace)
    {
        var type = Type.GetTypeFromProgID(ProgId, throwOnError: false);
        if (type is null)
        {
            throw new WorkerException(
                "SDK_NOT_AVAILABLE",
                $"COM ProgID '{ProgId}' is not registered on this machine. " +
                "Install the ZKTeco Standalone SDK (or the legacy Fingerprint Attendance System) and register zkemkeeper.dll.");
        }

        object instance;
        try
        {
            instance = Activator.CreateInstance(type)
                ?? throw new WorkerException("SDK_REGISTRATION_FAILED", $"Activator returned no instance for '{ProgId}'.");
        }
        catch (COMException exception)
        {
            throw new WorkerException(
                "SDK_REGISTRATION_FAILED",
                $"Could not create '{ProgId}': {exception.Message}. " +
                "0x80040154 here almost always means the process is 64-bit; zkemkeeper is registered under WOW6432Node and requires an x86 process.",
                ComDispatch.FormatHResult(exception));
        }

        trace($"COM instance created via {ProgId}");
        return new ZkemAdapter(instance, options, trace);
    }

    // ------------------------------------------------------------- gated calls

    private object? Invoke(string method, params object?[] args)
    {
        Guard(method);
        return ComDispatch.Call(Com, method, args);
    }

    private object? InvokeByRef(string method, object?[] args, params int[] byRefIndexes)
    {
        Guard(method);
        return ComDispatch.CallByRef(Com, method, args, byRefIndexes);
    }

    private void Guard(string method)
    {
        if (AllowedMethods.Contains(method))
        {
            return;
        }

        if (ProbeOnlyMethods.Contains(method) && _options.ProbeLatestLog)
        {
            return;
        }

        throw new WorkerException(
            "READ_ONLY_VIOLATION",
            ProbeOnlyMethods.Contains(method)
                ? $"'{method}' is probe-only and requires an explicit --probe-latest-log opt-in."
                : $"'{method}' is not on the read-only allowlist and was refused before reaching the device.");
    }

    // ------------------------------------------------------------- lifecycle

    public ConnectionInfo Connect()
    {
        var info = new ConnectionInfo
        {
            Host = _options.Host,
            Port = _options.Port,
            MachineNumber = _options.MachineNumber,
        };

        if (_options.CommKey != 0)
        {
            // Client-side setting: it tells the SDK which comm key to present.
            // Skipped entirely for comm key 0, which is what the K50 uses, so the
            // validated call sequence is unchanged in the normal case.
            _trace("Applying non-zero comm key to the SDK client before connecting");
            Invoke("SetCommPassword", _options.CommKey);
            info.CommKeyApplied = true;
        }

        var stopwatch = Stopwatch.StartNew();
        bool connected;
        try
        {
            connected = ComDispatch.AsBool(Invoke("Connect_Net", _options.Host, _options.Port));
        }
        catch (Exception exception) when (exception is not WorkerException)
        {
            throw new WorkerException(
                "DEVICE_UNREACHABLE",
                $"Connect_Net('{_options.Host}', {_options.Port}) threw: {exception.Message}",
                ComDispatch.FormatHResult(exception));
        }
        stopwatch.Stop();

        info.ConnectDurationMs = stopwatch.ElapsedMilliseconds;
        info.Connected = connected;

        if (!connected)
        {
            throw new WorkerException(
                "DEVICE_UNREACHABLE",
                $"Connect_Net('{_options.Host}', {_options.Port}) returned false.",
                sdkErrorCode: TryGetLastError());
        }

        _connected = true;
        _trace($"Connect_Net succeeded in {info.ConnectDurationMs} ms");
        return info;
    }

    public bool Disconnect()
    {
        if (!_connected)
        {
            return true;
        }

        try
        {
            Invoke("Disconnect");
            _connected = false;
            _trace("Disconnect succeeded");
            return true;
        }
        catch (Exception exception)
        {
            _trace($"Disconnect failed: {exception.Message}");
            return false;
        }
    }

    public void Dispose()
    {
        Disconnect();

        if (_com is not null)
        {
            try
            {
                Marshal.FinalReleaseComObject(_com);
            }
            catch
            {
                // Releasing a COM object must never mask the real result.
            }
            _com = null;
        }
    }

    private int? TryGetLastError()
    {
        try
        {
            var args = new object?[] { 0 };
            InvokeByRef("GetLastError", args, 0);
            return ComDispatch.AsInt(args[0]);
        }
        catch
        {
            return null;
        }
    }

    // ------------------------------------------------------------ device info

    public DeviceInfo ReadDeviceInfo()
    {
        var device = new DeviceInfo
        {
            Manufacturer = "ZKTeco",
            MachineNumber = _options.MachineNumber,
            Host = _options.Host,
            Port = _options.Port,
        };

        device.SerialNumber = ReadStringField(device, "serialNumber", "GetSerialNumber", withMachineNumber: true);
        device.Model = ReadStringField(device, "model", "GetProductCode", withMachineNumber: true);
        device.FirmwareVersion = ReadStringField(device, "firmwareVersion", "GetFirmwareVersion", withMachineNumber: true);
        device.Platform = ReadStringField(device, "platform", "GetPlatform", withMachineNumber: true);
        device.MacAddress = ReadStringField(device, "macAddress", "GetDeviceMAC", withMachineNumber: true);

        var vendor = ReadStringField(device, "vendor", "GetVendor", withMachineNumber: false);
        if (!string.IsNullOrWhiteSpace(vendor))
        {
            device.Manufacturer = vendor;
        }

        device.DeviceTimeLocal = ReadDeviceTime(device);
        ReadDeviceStatuses(device);

        return device;
    }

    /// <summary>
    /// Optional metadata: a getter that returns false or throws is recorded and
    /// skipped. It never fails the run — the serial number is the only field the
    /// caller treats as significant, and even that is reported rather than fatal.
    /// </summary>
    private string? ReadStringField(DeviceInfo device, string fieldName, string method, bool withMachineNumber)
    {
        try
        {
            object?[] args = withMachineNumber
                ? new object?[] { _options.MachineNumber, string.Empty }
                : new object?[] { string.Empty };
            var outIndex = withMachineNumber ? 1 : 0;

            var ok = ComDispatch.AsBool(InvokeByRef(method, args, outIndex));
            var value = ComDispatch.AsTrimmedString(args[outIndex]);

            if (!ok || value is null)
            {
                device.UnavailableFields.Add(fieldName);
                return null;
            }

            return value;
        }
        catch (Exception exception)
        {
            _trace($"{method} unavailable: {exception.Message}");
            device.UnavailableFields.Add(fieldName);
            return null;
        }
    }

    private string? ReadDeviceTime(DeviceInfo device)
    {
        try
        {
            var args = new object?[] { _options.MachineNumber, 0, 0, 0, 0, 0, 0 };
            var ok = ComDispatch.AsBool(InvokeByRef("GetDeviceTime", args, 1, 2, 3, 4, 5, 6));
            if (!ok)
            {
                device.UnavailableFields.Add("deviceTimeLocal");
                return null;
            }

            return ComposeLocalTimestamp(
                ComDispatch.AsInt(args[1]),
                ComDispatch.AsInt(args[2]),
                ComDispatch.AsInt(args[3]),
                ComDispatch.AsInt(args[4]),
                ComDispatch.AsInt(args[5]),
                ComDispatch.AsInt(args[6]));
        }
        catch (Exception exception)
        {
            _trace($"GetDeviceTime unavailable: {exception.Message}");
            device.UnavailableFields.Add("deviceTimeLocal");
            return null;
        }
    }

    /// <summary>
    /// Reads GetDeviceStatus for the low status codes and reports them verbatim.
    /// The codes are NOT named here: their meanings are not verified against this
    /// firmware, and inventing labels would be a guess.
    /// </summary>
    private void ReadDeviceStatuses(DeviceInfo device)
    {
        for (var code = 1; code <= 6; code++)
        {
            try
            {
                var args = new object?[] { _options.MachineNumber, code, 0 };
                var ok = ComDispatch.AsBool(InvokeByRef("GetDeviceStatus", args, 2));
                if (ok)
                {
                    device.DeviceStatusRaw[code.ToString(CultureInfo.InvariantCulture)] = ComDispatch.AsInt(args[2]);
                }
            }
            catch
            {
                // A status code this firmware does not implement is not an error.
            }
        }
    }

    // ------------------------------------------------------------------ users

    /// <summary>
    /// Reads the device user directory using the validated call pair
    /// ReadAllUserID + SSR_GetAllUserInfo.
    ///
    /// SSR_GetAllUserInfo hands back a password in its fourth argument. That slot
    /// is cleared the instant the call returns and is never copied, logged,
    /// serialised or returned — <see cref="WorkerUser"/> has no field to hold it.
    /// No template/biometric API is called: this reads the user directory only.
    /// </summary>
    public List<WorkerUser> ReadUsers()
    {
        var users = new List<WorkerUser>();

        bool buffered;
        try
        {
            buffered = ComDispatch.AsBool(Invoke("ReadAllUserID", _options.MachineNumber));
        }
        catch (Exception exception) when (exception is not WorkerException)
        {
            throw new WorkerException("READ_USERS_FAILED", $"ReadAllUserID threw: {exception.Message}", ComDispatch.FormatHResult(exception));
        }

        if (!buffered)
        {
            throw new WorkerException(
                "READ_USERS_FAILED",
                "ReadAllUserID returned false, so no user buffer was loaded from the device.",
                sdkErrorCode: TryGetLastError());
        }

        _trace("ReadAllUserID buffered the user directory");

        while (users.Count < _options.MaxUsers)
        {
            // enrollNumber, name, password, privilege, enabled
            var args = new object?[] { _options.MachineNumber, string.Empty, string.Empty, string.Empty, 0, false };

            bool more;
            try
            {
                more = ComDispatch.AsBool(InvokeByRef("SSR_GetAllUserInfo", args, 1, 2, 3, 4, 5));
            }
            catch (Exception exception) when (exception is not WorkerException)
            {
                throw new WorkerException("READ_USERS_FAILED", $"SSR_GetAllUserInfo threw: {exception.Message}", ComDispatch.FormatHResult(exception));
            }

            // Discard the password before anything else touches the args array.
            args[3] = null;

            if (!more)
            {
                break;
            }

            var externalUserId = ComDispatch.AsTrimmedString(args[1]);
            if (string.IsNullOrEmpty(externalUserId))
            {
                continue;
            }

            users.Add(new WorkerUser
            {
                ExternalUserId = externalUserId,
                Name = ComDispatch.AsTrimmedString(args[2]),
                PrivilegeRaw = ComDispatch.AsInt(args[4]),
                Enabled = ComDispatch.AsBool(args[5]),
            });
        }

        _trace($"SSR_GetAllUserInfo returned {users.Count} user record(s)");
        return users;
    }

    // ------------------------------------------------------------- attendance

    /// <summary>
    /// Reads raw attendance transactions using the validated call pair
    /// ReadGeneralLogData + SSR_GetGeneralLogData.
    ///
    /// Verify / State / WorkCode are carried through as raw integers. No punch is
    /// classified here — that belongs to DijiPeople's attendance engine later.
    /// </summary>
    public List<WorkerPunch> ReadAttendance()
    {
        var punches = new List<WorkerPunch>();

        bool buffered;
        try
        {
            buffered = ComDispatch.AsBool(Invoke("ReadGeneralLogData", _options.MachineNumber));
        }
        catch (Exception exception) when (exception is not WorkerException)
        {
            throw new WorkerException("READ_ATTENDANCE_FAILED", $"ReadGeneralLogData threw: {exception.Message}", ComDispatch.FormatHResult(exception));
        }

        if (!buffered)
        {
            throw new WorkerException(
                "READ_ATTENDANCE_FAILED",
                "ReadGeneralLogData returned false, so no attendance buffer was loaded from the device.",
                sdkErrorCode: TryGetLastError());
        }

        _trace("ReadGeneralLogData buffered the attendance log");

        while (punches.Count < _options.MaxAttendance)
        {
            // enrollNumber, verifyMode, inOutMode, year, month, day, hour, minute, second, workCode
            var args = new object?[] { _options.MachineNumber, string.Empty, 0, 0, 0, 0, 0, 0, 0, 0, 0 };

            bool more;
            try
            {
                more = ComDispatch.AsBool(InvokeByRef("SSR_GetGeneralLogData", args, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10));
            }
            catch (Exception exception) when (exception is not WorkerException)
            {
                throw new WorkerException("READ_ATTENDANCE_FAILED", $"SSR_GetGeneralLogData threw: {exception.Message}", ComDispatch.FormatHResult(exception));
            }

            if (!more)
            {
                break;
            }

            var externalUserId = ComDispatch.AsTrimmedString(args[1]);
            if (string.IsNullOrEmpty(externalUserId))
            {
                continue;
            }

            var occurredAt = ComposeLocalTimestamp(
                ComDispatch.AsInt(args[4]),
                ComDispatch.AsInt(args[5]),
                ComDispatch.AsInt(args[6]),
                ComDispatch.AsInt(args[7]),
                ComDispatch.AsInt(args[8]),
                ComDispatch.AsInt(args[9]));

            if (occurredAt is null)
            {
                continue;
            }

            punches.Add(new WorkerPunch
            {
                ExternalUserId = externalUserId,
                OccurredAtLocal = occurredAt,
                VerificationModeRaw = ComDispatch.AsInt(args[2]),
                PunchStateRaw = ComDispatch.AsInt(args[3]),
                WorkCodeRaw = ComDispatch.AsInt(args[10]),
            });
        }

        _trace($"SSR_GetGeneralLogData returned {punches.Count} attendance record(s)");
        return punches;
    }

    public SdkCapabilities Probe() => SdkProbe.Probe(Com);

    // ------------------------------------------------------- latest-log probe

    /// <summary>
    /// OPT-IN ONLY. Calls ReadLastestLogData once and drains at most
    /// <see cref="WorkerOptions.ProbeLimit"/> records with the already-validated
    /// SSR_GetGeneralLogData getter.
    ///
    /// ⚠ SAFETY: this is an EXPERIMENT, not a proven-safe operation. Whether
    /// ReadLastestLogData advances a device-side read marker cannot be determined
    /// from type information, so running this against the customer's production
    /// terminal risks disturbing the incremental downloads their V2011 software
    /// relies on. The CLI therefore refuses to reach this code without an
    /// explicit acknowledgement flag. See the README.
    ///
    /// What it will NOT do: clear logs, change device time, touch users, or call
    /// any marker/count setter. The getter only drains an SDK-side buffer, and
    /// stopping early leaves that buffer partially read — an in-process concern,
    /// not device state.
    /// </summary>
    public LatestLogProbeResult ProbeLatestLog()
    {
        var probe = new LatestLogProbeResult
        {
            ReadMethod = "ReadLastestLogData",
            GetMethod = "SSR_GetGeneralLogData",
            RecordLimit = _options.ProbeLimit,
        };

        _trace($"OPT-IN PROBE: calling ReadLastestLogData (limit {_options.ProbeLimit} records)");

        try
        {
            probe.ReadSucceeded = ComDispatch.AsBool(Invoke("ReadLastestLogData", _options.MachineNumber));
        }
        catch (Exception exception)
        {
            probe.Error = $"ReadLastestLogData threw: {exception.Message} ({ComDispatch.FormatHResult(exception)})";
            _trace(probe.Error);
            return probe;
        }

        if (!probe.ReadSucceeded)
        {
            probe.Error = "ReadLastestLogData returned false; no buffer was filled.";
            _trace(probe.Error);
            return probe;
        }

        try
        {
            while (probe.Records.Count < _options.ProbeLimit)
            {
                var args = new object?[] { _options.MachineNumber, string.Empty, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
                if (!ComDispatch.AsBool(InvokeByRef("SSR_GetGeneralLogData", args, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)))
                {
                    break;
                }

                var externalUserId = ComDispatch.AsTrimmedString(args[1]);
                var occurredAt = ComposeLocalTimestamp(
                    ComDispatch.AsInt(args[4]),
                    ComDispatch.AsInt(args[5]),
                    ComDispatch.AsInt(args[6]),
                    ComDispatch.AsInt(args[7]),
                    ComDispatch.AsInt(args[8]),
                    ComDispatch.AsInt(args[9]));

                if (string.IsNullOrEmpty(externalUserId) || occurredAt is null)
                {
                    continue;
                }

                probe.Records.Add(new WorkerPunch
                {
                    ExternalUserId = externalUserId,
                    OccurredAtLocal = occurredAt,
                    VerificationModeRaw = ComDispatch.AsInt(args[2]),
                    PunchStateRaw = ComDispatch.AsInt(args[3]),
                    WorkCodeRaw = ComDispatch.AsInt(args[10]),
                });
            }
        }
        catch (Exception exception)
        {
            probe.Error = $"SSR_GetGeneralLogData threw during the probe: {exception.Message}";
            _trace(probe.Error);
        }

        probe.RecordsReturned = probe.Records.Count;
        _trace($"OPT-IN PROBE: ReadLastestLogData yielded {probe.RecordsReturned} record(s)");
        return probe;
    }

    /// <summary>
    /// Composes the SDK's separate date/time parts into "yyyy-MM-ddTHH:mm:ss".
    /// The device reports wall-clock parts with no timezone, so none is attached
    /// and no UTC conversion is performed. Out-of-range parts yield null rather
    /// than a silently wrong timestamp.
    /// </summary>
    private static string? ComposeLocalTimestamp(int year, int month, int day, int hour, int minute, int second)
    {
        if (year < 1900 || year > 2999 || month is < 1 or > 12 || day is < 1 or > 31 ||
            hour is < 0 or > 23 || minute is < 0 or > 59 || second is < 0 or > 59)
        {
            return null;
        }

        try
        {
            var value = new DateTime(year, month, day, hour, minute, second, DateTimeKind.Unspecified);
            return value.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
    }
}

internal sealed class WorkerException : Exception
{
    public WorkerException(string code, string message, string? hresult = null, int? sdkErrorCode = null)
        : base(message)
    {
        Code = code;
        HResultText = hresult;
        SdkErrorCode = sdkErrorCode;
    }

    public string Code { get; }
    public string? HResultText { get; }
    public int? SdkErrorCode { get; }
}
