using System.Globalization;

namespace DijiPeople.ZkTeco.Worker;

/// <summary>
/// Human-readable diagnostic report.
///
/// This is what makes the executable usable on a customer machine on its own: an
/// engineer running it over Remote Desktop gets a readable answer, not a wall of
/// JSON. The machine-readable contract is still available via --json (which the
/// DijiPeople CLI always passes) and via --output.
///
/// Reporting rules kept consistent with the rest of the POC:
///   - raw device codes are shown raw, never translated into check-in/check-out
///   - timestamps are labelled as device-local wall clock with no timezone
///   - the SDK firmware string is labelled as such, since the device UI differs
///   - large record sets are summarised, never dumped
/// </summary>
internal static class ConsoleReport
{
    private const int UserPreviewRows = 15;
    private const int PunchPreviewRows = 10;
    private const string NotReported = "(not reported by SDK)";

    public static void Render(WorkerResult result, WorkerOptions options, TextWriter output)
    {
        var title = $"DijiPeople ZKTeco Worker - {options.Mode.ToString().ToLowerInvariant()}";
        output.WriteLine();
        output.WriteLine(title);
        output.WriteLine(new string('=', title.Length));
        output.WriteLine();

        RenderRuntime(result, output);

        if (result.Connection is not null)
        {
            RenderConnection(result.Connection, output);
        }
        else if (options.RequiresConnection)
        {
            output.WriteLine("Connection");
            output.WriteLine("----------");
            output.WriteLine("  NOT ESTABLISHED");
            output.WriteLine();
        }
        else
        {
            output.WriteLine("Connection");
            output.WriteLine("----------");
            output.WriteLine("  Not required for this mode - capability inspection reads type");
            output.WriteLine("  metadata only and never contacts the device.");
            output.WriteLine();
        }

        if (result.Device is not null)
        {
            RenderDevice(result.Device, output);
        }

        if (result.Capabilities is not null)
        {
            RenderCapabilities(result.Capabilities, options, output);
        }

        if (result.Users is not null)
        {
            RenderUsers(result.Users, output);
        }

        if (result.Attendance is not null)
        {
            RenderAttendance(result.Attendance, output);
        }

        if (result.LatestLogProbe is not null)
        {
            RenderLatestLogProbe(result.LatestLogProbe, output);
        }

        if (options.Mode == WorkerMode.Poc)
        {
            RenderGuarantees(output);
        }

        RenderOutcome(result, output);
    }

    private static void Pairs(TextWriter output, IEnumerable<(string Label, string Value)> rows, string indent = "  ")
    {
        var list = rows.ToList();
        if (list.Count == 0) return;
        var width = list.Max(row => row.Label.Length);
        foreach (var (label, value) in list)
        {
            output.WriteLine($"{indent}{label.PadRight(width)}  {value}");
        }
    }

    private static void RenderRuntime(WorkerResult result, TextWriter output)
    {
        output.WriteLine("Runtime");
        output.WriteLine("-------");
        Pairs(output, new[]
        {
            ("Architecture", result.Runtime.Is64BitProcess ? "x64  ** WRONG - zkemkeeper requires x86 **" : "x86"),
            ("Process architecture", result.Runtime.ProcessArchitecture),
            ("Framework", result.Runtime.Framework),
            ("Operating system", result.Runtime.OsVersion),
            ("COM component", result.Com.ProgId),
            ("CLSID", result.Com.Clsid ?? NotReported),
            ("COM instantiated", result.Com.Instantiated ? "yes" : "no"),
        });
        output.WriteLine();
    }

    private static void RenderConnection(ConnectionInfo connection, TextWriter output)
    {
        output.WriteLine("Connection");
        output.WriteLine("----------");
        Pairs(output, new[]
        {
            ("Host / Port", $"{connection.Host}:{connection.Port}"),
            ("Machine number", connection.MachineNumber.ToString(CultureInfo.InvariantCulture)),
            ("Comm key", connection.CommKeyApplied ? "configured (value not shown)" : "none (0)"),
            ("Connect_Net", connection.Connected
                ? $"SUCCESS ({connection.ConnectDurationMs} ms)"
                : "FAILED"),
            ("Disconnect", connection.Disconnected ? "SUCCESS" : "NOT CONFIRMED"),
        });
        output.WriteLine();
    }

    private static void RenderDevice(DeviceInfo device, TextWriter output)
    {
        output.WriteLine("Device");
        output.WriteLine("------");

        var rows = new List<(string, string)>
        {
            ("Manufacturer", device.Manufacturer),
            ("Model", device.Model ?? NotReported),
            ("Serial", device.SerialNumber ?? NotReported),
            // The SDK string is known to differ from the device UI. Both are
            // reported as-is; neither is corrected.
            ("Firmware (SDK)", device.FirmwareVersion is null
                ? NotReported
                : $"{device.FirmwareVersion}   [SDK value; the device UI may show a different version]"),
            ("Platform", device.Platform ?? NotReported),
            ("MAC", device.MacAddress ?? NotReported),
            ("Device time", device.DeviceTimeLocal is null
                ? NotReported
                : $"{device.DeviceTimeLocal}   [device-local wall clock, no timezone]"),
            ("Host / Port", $"{device.Host}:{device.Port}"),
            ("Machine number", device.MachineNumber.ToString(CultureInfo.InvariantCulture)),
        };

        if (device.DeviceStatusRaw.Count > 0)
        {
            var pairs = string.Join(" ", device.DeviceStatusRaw.Select(entry => $"{entry.Key}={entry.Value}"));
            rows.Add(("Device status (raw)", $"{pairs}   [code meanings unverified]"));
        }

        if (device.UnavailableFields.Count > 0)
        {
            rows.Add(("Unavailable metadata", string.Join(", ", device.UnavailableFields)));
        }

        Pairs(output, rows);
        output.WriteLine();
    }

    private static void RenderCapabilities(SdkCapabilities capabilities, WorkerOptions options, TextWriter output)
    {
        output.WriteLine("SDK capabilities");
        output.WriteLine("----------------");

        if (!capabilities.TypeInfoAvailable)
        {
            output.WriteLine($"  Type information unavailable: {capabilities.ProbeError}");
            output.WriteLine("  Incremental-retrieval support therefore remains UNKNOWN.");
            output.WriteLine();
            return;
        }

        output.WriteLine($"  Methods exposed: {capabilities.Methods.Count}");
        if (capabilities.FilteredBy is not null)
        {
            output.WriteLine($"  Filtered by --method \"{capabilities.FilteredBy}\": {capabilities.Signatures.Count} match(es)");
        }
        output.WriteLine();

        var toShow = capabilities.FilteredBy is not null
            ? capabilities.Signatures
            : capabilities.TargetSignatures;

        if (toShow.Count > 0)
        {
            output.WriteLine(capabilities.FilteredBy is not null
                ? "  Matching signatures"
                : "  Signatures under investigation");
            foreach (var signature in toShow)
            {
                RenderSignature(signature, output);
            }
            output.WriteLine();
        }
        else if (capabilities.FilteredBy is not null)
        {
            output.WriteLine($"  No method name contains \"{capabilities.FilteredBy}\".");
            output.WriteLine();
        }

        if (capabilities.FilteredBy is null)
        {
            if (capabilities.LogRelatedMethods.Count > 0)
            {
                output.WriteLine("  Log / attendance related methods:");
                foreach (var method in capabilities.LogRelatedMethods)
                {
                    output.WriteLine($"    {method}");
                }
                output.WriteLine();
            }

            if (capabilities.MarkerRelatedMethods.Count > 0)
            {
                output.WriteLine("  Read-marker / counter / clear methods present on the component");
                output.WriteLine("  (listed so their existence is visible - NONE are ever called):");
                foreach (var method in capabilities.MarkerRelatedMethods)
                {
                    output.WriteLine($"    {method}");
                }
                output.WriteLine();
            }

            if (capabilities.IncrementalCandidates.Count > 0)
            {
                output.WriteLine("  Incremental-retrieval candidates:");
                Pairs(output, capabilities.IncrementalCandidates
                    .Select(entry => (entry.Key, entry.Value ? "PRESENT" : "absent")), "    ");
                output.WriteLine();
            }
        }

        output.WriteLine("  Interpretation limits");
        output.WriteLine("    PRESENT means the component exposes the method. It does NOT mean this");
        output.WriteLine("    firmware honours it, and it does NOT mean the method is free of");
        output.WriteLine("    device-side side effects. Type information describes a calling");
        output.WriteLine("    convention, not behaviour: whether a call advances or clears a");
        output.WriteLine("    device-side read marker CANNOT be determined from this output.");
        output.WriteLine();
    }

    private static void RenderSignature(SdkMethodSignature signature, TextWriter output)
    {
        output.WriteLine();
        output.WriteLine($"    {signature.Name}");
        output.WriteLine($"    {new string('-', signature.Name.Length)}");

        var rows = new List<(string, string)>
        {
            ("DISPID", signature.DispId.ToString(CultureInfo.InvariantCulture)),
            ("Invoke kind", signature.InvokeKind),
            ("Return type", signature.ReturnType),
            ("Parameters", signature.ParameterCount.ToString(CultureInfo.InvariantCulture)),
            ("Optional parameters", signature.OptionalParameterCount.ToString(CultureInfo.InvariantCulture)),
        };

        if (!string.IsNullOrWhiteSpace(signature.HelpString))
        {
            rows.Add(("Help string", signature.HelpString!));
        }

        rows.Add(("Declaration", signature.Declaration));
        Pairs(output, rows, "      ");

        if (signature.Parameters.Count > 0)
        {
            output.WriteLine();
            output.WriteLine("      Parameters:");
            Pairs(output, signature.Parameters.Select(parameter =>
                ($"#{parameter.Position} {parameter.Name}",
                 $"{parameter.Type}  [{parameter.Direction}]" +
                 (parameter.IsOptional ? " optional" : string.Empty) +
                 (parameter.HasDefault ? " hasDefault" : string.Empty) +
                 (parameter.IsReturnValue ? " retval" : string.Empty))), "        ");
        }
    }

    private static void RenderUsers(List<WorkerUser> users, TextWriter output)
    {
        output.WriteLine("Users");
        output.WriteLine("-----");
        output.WriteLine($"  Retrieved: {users.Count:N0}");

        if (users.Count > 0)
        {
            var preview = users.Take(UserPreviewRows).ToList();
            output.WriteLine();
            output.WriteLine($"  First {preview.Count} of {users.Count:N0}:");
            Pairs(output, preview.Select(user =>
                (user.ExternalUserId,
                 $"{user.Name ?? "(no name)"}   privilegeRaw={user.PrivilegeRaw?.ToString(CultureInfo.InvariantCulture) ?? "-"} enabled={user.Enabled?.ToString() ?? "-"}")),
                "    ");
        }

        output.WriteLine();
        output.WriteLine("  Passwords returned by SSR_GetAllUserInfo are discarded on return and");
        output.WriteLine("  never appear in this report or in the JSON output.");
        output.WriteLine();
    }

    private static void RenderAttendance(List<WorkerPunch> punches, TextWriter output)
    {
        output.WriteLine("Attendance");
        output.WriteLine("----------");
        output.WriteLine($"  Raw records retrieved: {punches.Count:N0}");

        if (punches.Count > 0)
        {
            // The format is fixed-width, so ordinal comparison orders correctly.
            var stamps = punches.Select(punch => punch.OccurredAtLocal).ToList();
            var earliest = stamps.Min(StringComparer.Ordinal);
            var latest = stamps.Max(StringComparer.Ordinal);
            output.WriteLine($"  Range (device local):  {earliest} .. {latest}");

            var preview = punches.Take(PunchPreviewRows).ToList();
            output.WriteLine();
            output.WriteLine($"  First {preview.Count} record(s):");
            Pairs(output, preview.Select(punch =>
                (punch.OccurredAtLocal,
                 $"user {punch.ExternalUserId}   verifyRaw={punch.VerificationModeRaw?.ToString(CultureInfo.InvariantCulture) ?? "-"} " +
                 $"stateRaw={punch.PunchStateRaw?.ToString(CultureInfo.InvariantCulture) ?? "-"} " +
                 $"workCodeRaw={punch.WorkCodeRaw?.ToString(CultureInfo.InvariantCulture) ?? "-"}")),
                "    ");
        }

        output.WriteLine();
        output.WriteLine("  Raw device codes - no check-in/check-out meaning is assigned here.");
        output.WriteLine("  Timestamps are device-local wall clock; no timezone is implied.");
        output.WriteLine("  ReadGeneralLogData returns the device's whole stored history, not just");
        output.WriteLine("  new records.");
        output.WriteLine();
    }

    private static void RenderLatestLogProbe(LatestLogProbeResult probe, TextWriter output)
    {
        output.WriteLine("ReadLastestLogData probe (opt-in experiment)");
        output.WriteLine("-------------------------------------------");
        Pairs(output, new[]
        {
            ("Read method", probe.ReadMethod),
            ("Getter", probe.GetMethod),
            ("Read succeeded", probe.ReadSucceeded.ToString()),
            ("Record limit", probe.RecordLimit.ToString(CultureInfo.InvariantCulture)),
            ("Records returned", probe.RecordsReturned.ToString(CultureInfo.InvariantCulture)),
        });

        if (!string.IsNullOrWhiteSpace(probe.Error))
        {
            output.WriteLine($"  Error: {probe.Error}");
        }

        if (probe.Records.Count > 0)
        {
            output.WriteLine();
            output.WriteLine("  Raw records (no semantic interpretation applied):");
            Pairs(output, probe.Records.Select(record =>
                (record.OccurredAtLocal,
                 $"user {record.ExternalUserId}   verifyRaw={record.VerificationModeRaw?.ToString(CultureInfo.InvariantCulture) ?? "-"} " +
                 $"stateRaw={record.PunchStateRaw?.ToString(CultureInfo.InvariantCulture) ?? "-"} " +
                 $"workCodeRaw={record.WorkCodeRaw?.ToString(CultureInfo.InvariantCulture) ?? "-"}")),
                "    ");
        }

        output.WriteLine();
        output.WriteLine("  This run does NOT establish whether ReadLastestLogData advanced a");
        output.WriteLine("  device-side read marker, nor whether V2011 will now miss records.");
        output.WriteLine();
    }

    private static void RenderGuarantees(TextWriter output)
    {
        output.WriteLine("Guarantees");
        output.WriteLine("----------");
        Pairs(output, new[]
        {
            ("Biometric templates", "NOT RETRIEVED"),
            ("Passwords", "NOT STORED"),
            ("Device state modified", "NO (read-only allowlist)"),
            ("Logs cleared", "NO"),
            ("Device clock changed", "NO"),
            ("Users changed", "NO"),
            ("Stable transaction ID", "NOT EXPOSED BY THIS SDK"),
        });
        output.WriteLine();
    }

    private static void RenderOutcome(WorkerResult result, TextWriter output)
    {
        output.WriteLine("Outcome");
        output.WriteLine("-------");

        if (result.Error is null)
        {
            output.WriteLine("  PASS");
            output.WriteLine();
            return;
        }

        output.WriteLine($"  FAIL - {result.Error.Code}");
        output.WriteLine();
        output.WriteLine($"  {result.Error.Message}");

        if (!string.IsNullOrWhiteSpace(result.Error.HResult))
        {
            output.WriteLine($"  HRESULT: {result.Error.HResult}");
        }
        if (result.Error.SdkErrorCode is not null)
        {
            output.WriteLine($"  SDK error code: {result.Error.SdkErrorCode}");
        }

        foreach (var hint in RemediationFor(result.Error.Code))
        {
            output.WriteLine($"    - {hint}");
        }

        output.WriteLine();
    }

    private static IEnumerable<string> RemediationFor(string code) => code switch
    {
        "SDK_NOT_AVAILABLE" or "SDK_REGISTRATION_FAILED" or "ARCHITECTURE_MISMATCH" => new[]
        {
            "register the COM component (elevated): regsvr32 C:\\Windows\\SysWOW64\\zkemkeeper.dll",
            "confirm HKEY_CLASSES_ROOT\\WOW6432Node\\CLSID\\{00853A19-BD51-419B-9269-2DABE57EB61F} exists",
            "confirm this executable is the win-x86 build - a 64-bit process reports 0x80040154",
        },
        "DEVICE_UNREACHABLE" => new[]
        {
            "check the device is powered on and showing its idle screen",
            "Test-NetConnection <host> -Port 4370",
            "check Windows Firewall and any network ACL",
            "check the Comm Key matches --comm-key",
            "check no other application is holding the device (e.g. Fingerprint Attendance System V2011)",
        },
        "READ_USERS_FAILED" or "READ_ATTENDANCE_FAILED" => new[]
        {
            "retry with the device idle and V2011 closed",
            "a false return usually means the session dropped mid-read",
        },
        "CONFIG_INVALID" => new[] { "run with --help to see the accepted arguments" },
        "OUTPUT_WRITE_FAILED" => new[] { "check the --output path is writable and not open elsewhere" },
        _ => Array.Empty<string>(),
    };
}
