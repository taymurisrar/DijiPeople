using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace DijiPeople.ZkTeco.Worker;

/// <summary>
/// Late-bound COM helpers.
///
/// zkemkeeper ships no primary interop assembly we can reference from a .NET 8
/// project, so every call goes through IDispatch late binding. That is exactly
/// what the manual PowerShell validation did — `$zk.Connect_Net(...)` is late
/// binding too — so this keeps the proven call path intact.
/// </summary>
internal static class ComDispatch
{
    private const BindingFlags CallFlags = BindingFlags.InvokeMethod | BindingFlags.Public | BindingFlags.Instance;

    /// <summary>Invokes a method with no by-ref parameters.</summary>
    public static object? Call(object target, string method, params object?[] args)
        => target.GetType().InvokeMember(method, CallFlags, null, target, args, null, null, null);

    /// <summary>
    /// Invokes a method where some parameters are [out]/[ref]. The supplied
    /// <paramref name="args"/> array is updated in place with the returned values,
    /// which is how the SDK hands back serial numbers, user records and punches.
    /// </summary>
    public static object? CallByRef(object target, string method, object?[] args, params int[] byRefIndexes)
    {
        var modifier = new ParameterModifier(args.Length);
        foreach (var index in byRefIndexes)
        {
            modifier[index] = true;
        }

        return target.GetType().InvokeMember(
            method,
            CallFlags,
            null,
            target,
            args,
            new[] { modifier },
            null,
            null);
    }

    /// <summary>Coerces a VARIANT_BOOL / bool result into a plain bool.</summary>
    public static bool AsBool(object? value) => value switch
    {
        bool flag => flag,
        short number => number != 0,
        int number => number != 0,
        null => false,
        _ => Convert.ToBoolean(value),
    };

    public static int AsInt(object? value) => value switch
    {
        int number => number,
        short number => number,
        long number => (int)number,
        null => 0,
        _ => Convert.ToInt32(value),
    };

    public static string? AsTrimmedString(object? value)
    {
        var text = value as string;
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var cleaned = text.Trim().Trim('\0').Trim();
        return cleaned.Length == 0 ? null : cleaned;
    }

    /// <summary>Formats an exception's HRESULT the way the registry/error docs show it.</summary>
    public static string FormatHResult(Exception exception)
        => $"0x{exception.HResult:X8}";
}

/// <summary>
/// Minimal IDispatch declaration used ONLY to enumerate the component's type
/// information. GetIDsOfNames and Invoke are deliberately left undeclared — they
/// sit after these two entries in the vtable, so omitting them is safe as long as
/// nothing calls them, and their absence makes it impossible to invoke an
/// arbitrary method through this interface.
/// </summary>
[ComImport]
[Guid("00020400-0000-0000-C000-000000000046")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IDispatchProbe
{
    void GetTypeInfoCount(out uint typeInfoCount);

    void GetTypeInfo(uint typeInfoIndex, uint lcid, out ITypeInfo typeInfo);
}
