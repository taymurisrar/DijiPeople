using System.Globalization;
using System.Text;

namespace DijiPeople.Gateway.FakeWorker;

/// <summary>
/// Reproduces the behaviours the real worker can exhibit, on demand.
///
/// The mode comes from the DIJI_FAKE_WORKER_MODE environment variable rather
/// than an argument, so the gateway's own argument construction stays under test
/// — the supervisor builds the command line it would really build, and this
/// process ignores it exactly as an unhealthy worker would.
///
/// The JSON is assembled by concatenation rather than with interpolated raw
/// strings: the payloads are dense with braces, and a quoting mistake here would
/// look like a gateway parsing bug.
/// </summary>
internal static class Program
{
    private static int Main(string[] args)
    {
        var mode = Environment.GetEnvironmentVariable("DIJI_FAKE_WORKER_MODE") ?? "attendance";

        switch (mode)
        {
            case "hang":
                // Never exits. The supervisor's watchdog must kill it.
                Thread.Sleep(Timeout.Infinite);
                return 0;

            case "crash":
                Console.Error.WriteLine("fatal: simulated worker crash");
                return 3;

            case "usage":
                return 2;

            case "garbage":
                Console.Out.Write("this is not JSON at all {{{");
                return 0;

            case "huge":
                {
                    // Far past any configured ceiling, written in chunks so the
                    // supervisor sees a stream rather than one enormous write.
                    var chunk = new string('x', 64 * 1024);
                    for (var index = 0; index < 4096; index++)
                    {
                        Console.Out.Write(chunk);
                    }
                    return 0;
                }

            case "wrong-contract":
                Console.Out.Write("{\"contractVersion\":99,\"mode\":\"attendance\"}");
                return 0;

            case "x64":
                Console.Out.Write(
                    "{\"contractVersion\":1,\"mode\":\"attendance\"," +
                    "\"runtime\":{\"is64BitProcess\":true,\"processArchitecture\":\"X64\"}}");
                return 0;

            case "device-unreachable":
                Console.Out.Write(
                    "{\"contractVersion\":1,\"mode\":\"device-info\"," +
                    Runtime() +
                    "\"connection\":{\"host\":\"192.168.18.53\",\"port\":4370," +
                    "\"machineNumber\":1,\"connected\":false}," +
                    "\"error\":{\"code\":\"DEVICE_UNREACHABLE\"," +
                    "\"message\":\"Connect_Net returned false.\"}}");
                return 1;

            case "device-info":
                Console.Out.Write(DeviceInfoDocument());
                return 0;

            case "users":
                Console.Out.Write(UsersDocument());
                return 0;

            case "attendance":
            default:
                Console.Out.Write(AttendanceDocument());
                return 0;
        }
    }

    private static string Runtime() =>
        "\"runtime\":{\"is64BitProcess\":false,\"processArchitecture\":\"X86\"," +
        "\"framework\":\".NET 8.0\"},";

    private static string Connection() =>
        "\"connection\":{\"host\":\"192.168.18.53\",\"port\":4370,\"machineNumber\":1," +
        "\"connected\":true,\"connectDurationMs\":118,\"disconnected\":true},";

    private static string Device() =>
        "\"device\":{\"manufacturer\":\"ZKTeco\",\"model\":\"K50\"," +
        "\"serialNumber\":\"" + Serial + "\"," +
        "\"firmwareVersion\":\"Ver 6.60 Sep 19 2019\",\"platform\":\"ZLM60_TFT\"," +
        "\"macAddress\":\"00:17:61:11:22:33\"," +
        "\"deviceTimeLocal\":\"" + DeviceTime + "\"}";

    private static string DeviceInfoDocument() =>
        "{\"contractVersion\":1,\"mode\":\"device-info\"," +
        Runtime() +
        "\"com\":{\"progId\":\"zkemkeeper.ZKEM.1\",\"instantiated\":true}," +
        Connection() +
        Device() +
        "}";

    private static string UsersDocument() =>
        "{\"contractVersion\":1,\"mode\":\"users\"," +
        Runtime() +
        Connection() +
        Device() + "," +
        "\"users\":[" +
        "{\"externalUserId\":\"1\",\"name\":\"Ayesha Khan\",\"privilegeRaw\":0,\"enabled\":true}," +
        "{\"externalUserId\":\"2\",\"name\":\"Bilal Ahmed\",\"privilegeRaw\":14,\"enabled\":true}," +
        // A directory slot with no identifier: not a person the gateway can map,
        // and it must be dropped rather than turned into a blank employee.
        "{\"externalUserId\":\"  \",\"name\":\"blank id is dropped\"}" +
        "]}";

    /// <summary>
    /// A history spanning several years, like the reference K50's, plus one
    /// deliberately malformed record the adapter must drop rather than guess at.
    /// </summary>
    private static string AttendanceDocument()
    {
        var builder = new StringBuilder();
        builder.Append("{\"contractVersion\":1,\"mode\":\"attendance\",");
        builder.Append(Runtime());
        builder.Append(Connection());
        builder.Append(Device());
        builder.Append(",\"attendance\":[");

        var punches = new List<string>
        {
            // Old history: present on the device, outside a conservative import
            // window, and still fingerprinted locally so it is never re-examined.
            Punch("1", "2022-10-24T08:01:12", 1, 0),
            Punch("2", "2023-04-02T17:45:03", 1, 1),
            // Today, relative to the device clock this fake reports.
            Punch("1", Today + "T08:59:01", 1, 0),
            Punch("2", Today + "T09:02:44", 4, 0),
            // No timestamp: dropped, never invented.
            "{\"externalUserId\":\"3\",\"occurredAtLocal\":\"\"}",
        };

        var extra = int.TryParse(
            Environment.GetEnvironmentVariable("DIJI_FAKE_WORKER_PUNCHES"),
            NumberStyles.Integer,
            CultureInfo.InvariantCulture,
            out var configured)
            ? configured
            : 0;

        for (var index = 0; index < extra; index++)
        {
            var hour = 10 + (index / 3600 % 8);
            var minute = index / 60 % 60;
            var second = index % 60;
            punches.Add(Punch(
                ((index % 40) + 1).ToString(CultureInfo.InvariantCulture),
                $"{Today}T{hour:D2}:{minute:D2}:{second:D2}",
                1,
                index % 2));
        }

        builder.Append(string.Join(',', punches));
        builder.Append("]}");
        return builder.ToString();
    }

    private static string Punch(string user, string occurredAt, int verification, int punchState) =>
        "{\"externalUserId\":\"" + user + "\"," +
        "\"occurredAtLocal\":\"" + occurredAt + "\"," +
        "\"verificationModeRaw\":" + verification.ToString(CultureInfo.InvariantCulture) + "," +
        "\"punchStateRaw\":" + punchState.ToString(CultureInfo.InvariantCulture) + "," +
        "\"workCodeRaw\":0}";

    private static string Serial =>
        Environment.GetEnvironmentVariable("DIJI_FAKE_WORKER_SERIAL") ?? "A2QO221160250";

    private static string DeviceTime =>
        Environment.GetEnvironmentVariable("DIJI_FAKE_WORKER_DEVICE_TIME")
        ?? DateTime.Now.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);

    private static string Today => DeviceTime[..10];
}
