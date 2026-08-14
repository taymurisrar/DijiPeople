using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace DijiPeople.ZkTeco.Worker;

/// <summary>
/// Reads the full method surface — including exact signatures — straight off the
/// installed COM component's type library.
///
/// This is how the POC answers "what does this SDK actually expose, and with
/// what parameters?" with a fact instead of a guess.
///
/// WHAT THIS CAN AND CANNOT PROVE
///   CAN:    method existence, DISPID, return type, parameter count, parameter
///           names, parameter types, in/out/ref direction, optional parameters,
///           and the vendor's own help string where one is compiled in.
///   CANNOT: side effects. Type information describes a calling convention, not
///           behaviour. Nothing here can prove that a method does not advance or
///           clear a device-side read marker — that is invisible to metadata.
///
/// The whole enumeration reads type metadata only. No device method is invoked.
/// </summary>
internal static class SdkProbe
{
    /// <summary>
    /// Candidate names for incremental / time-ranged / cursor-style retrieval,
    /// checked for presence only. Presence means the component exposes the
    /// method, NOT that this K50's firmware honours it.
    /// </summary>
    private static readonly string[] IncrementalCandidates =
    {
        "ReadTimeGLogData",
        "ReadNewGLogData",
        "ReadLastestLogData",
        "ReadAllGLogData",
        "ReadGeneralLogData",
        "ReadGeneralLogDataEx",
        "GetGeneralExtLogData",
        "SSR_GetGeneralExtLogData",
        "SSR_GetGeneralLogData",
        "GetGeneralLogData",
        "GetAllGLogData",
        "GetGeneralLogDataCount",
        "SSR_GetGeneralLogDataCount",
        "GetAttLogCount",
        "GetDeviceData",
    };

    /// <summary>
    /// Methods whose exact signatures are being investigated for incremental
    /// retrieval. Reported in full and called out separately in the CLI report.
    /// </summary>
    public static readonly string[] SignatureTargets =
    {
        "ReadLastestLogData",
        "GetGeneralExtLogData",
        "GetAllGLogData",
        "ReadAllGLogData",
    };

    private static readonly string[] LogKeywords = { "log", "glog", "att", "time", "new", "count", "ext", "mark" };

    /// <summary>Names that suggest a method mutates a device-side read marker or counter.</summary>
    private static readonly string[] MarkerKeywords = { "mark", "lastcount", "setlast", "clear", "empty", "delete" };

    public static SdkCapabilities Probe(object comObject)
    {
        var capabilities = new SdkCapabilities();

        IntPtr typeAttrPtr = IntPtr.Zero;
        ITypeInfo? typeInfo = null;

        try
        {
            var dispatch = (IDispatchProbe)comObject;
            dispatch.GetTypeInfoCount(out var count);
            if (count == 0)
            {
                capabilities.ProbeError = "The COM component reported no type information (GetTypeInfoCount = 0).";
                return capabilities;
            }

            dispatch.GetTypeInfo(0, 0, out typeInfo);
            typeInfo.GetTypeAttr(out typeAttrPtr);
            var attributes = Marshal.PtrToStructure<TYPEATTR>(typeAttrPtr);

            var signatures = new List<SdkMethodSignature>();
            for (var index = 0; index < attributes.cFuncs; index++)
            {
                var signature = DescribeFunction(typeInfo, index);
                if (signature is not null)
                {
                    signatures.Add(signature);
                }
            }

            signatures.Sort((left, right) => string.CompareOrdinal(left.Name, right.Name));

            var names = new SortedSet<string>(signatures.Select(s => s.Name), StringComparer.Ordinal);

            capabilities.TypeInfoAvailable = true;
            capabilities.Methods = names.ToList();
            capabilities.Signatures = signatures;
            capabilities.TargetSignatures = signatures
                .Where(s => SignatureTargets.Contains(s.Name, StringComparer.Ordinal))
                .ToList();

            capabilities.LogRelatedMethods = names
                .Where(name => LogKeywords.Any(keyword => name.Contains(keyword, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            capabilities.MarkerRelatedMethods = names
                .Where(name => MarkerKeywords.Any(keyword => name.Contains(keyword, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            foreach (var candidate in IncrementalCandidates)
            {
                capabilities.IncrementalCandidates[candidate] = names.Contains(candidate);
            }
        }
        catch (Exception exception)
        {
            capabilities.TypeInfoAvailable = false;
            capabilities.ProbeError = $"{exception.GetType().Name}: {exception.Message} ({ComDispatch.FormatHResult(exception)})";
        }
        finally
        {
            if (typeAttrPtr != IntPtr.Zero && typeInfo is not null)
            {
                typeInfo.ReleaseTypeAttr(typeAttrPtr);
            }
        }

        return capabilities;
    }

    private static SdkMethodSignature? DescribeFunction(ITypeInfo typeInfo, int index)
    {
        var funcDescPtr = IntPtr.Zero;
        try
        {
            typeInfo.GetFuncDesc(index, out funcDescPtr);
            var funcDesc = Marshal.PtrToStructure<FUNCDESC>(funcDescPtr);

            typeInfo.GetDocumentation(funcDesc.memid, out var name, out var helpString, out _, out _);
            if (string.IsNullOrWhiteSpace(name))
            {
                return null;
            }

            // GetNames returns [methodName, param1, param2, ...]. The array is
            // sized for the declared parameter count plus the method name itself.
            var nameBuffer = new string[funcDesc.cParams + 1];
            var parameterNames = new string[funcDesc.cParams];
            try
            {
                typeInfo.GetNames(funcDesc.memid, nameBuffer, nameBuffer.Length, out var namesReturned);
                for (var i = 0; i < funcDesc.cParams; i++)
                {
                    parameterNames[i] = i + 1 < namesReturned ? nameBuffer[i + 1] ?? $"arg{i}" : $"arg{i}";
                }
            }
            catch
            {
                for (var i = 0; i < funcDesc.cParams; i++)
                {
                    parameterNames[i] = $"arg{i}";
                }
            }

            var signature = new SdkMethodSignature
            {
                Name = name,
                DispId = funcDesc.memid,
                InvokeKind = funcDesc.invkind.ToString(),
                ReturnType = DescribeTypeDesc(funcDesc.elemdescFunc.tdesc),
                ParameterCount = funcDesc.cParams,
                OptionalParameterCount = funcDesc.cParamsOpt,
                FuncFlags = funcDesc.wFuncFlags,
                HelpString = string.IsNullOrWhiteSpace(helpString) ? null : helpString,
            };

            var elementSize = Marshal.SizeOf<ELEMDESC>();
            for (var i = 0; i < funcDesc.cParams; i++)
            {
                var element = Marshal.PtrToStructure<ELEMDESC>(funcDesc.lprgelemdescParam + (i * elementSize));
                var flags = element.desc.paramdesc.wParamFlags;

                signature.Parameters.Add(new SdkParameter
                {
                    Position = i,
                    Name = parameterNames[i],
                    Type = DescribeTypeDesc(element.tdesc),
                    Direction = DescribeDirection(flags),
                    IsOptional = flags.HasFlag(PARAMFLAG.PARAMFLAG_FOPT),
                    HasDefault = flags.HasFlag(PARAMFLAG.PARAMFLAG_FHASDEFAULT),
                    IsReturnValue = flags.HasFlag(PARAMFLAG.PARAMFLAG_FRETVAL),
                    RawFlags = (int)flags,
                });
            }

            signature.Declaration = BuildDeclaration(signature);
            return signature;
        }
        catch
        {
            return null;
        }
        finally
        {
            if (funcDescPtr != IntPtr.Zero)
            {
                typeInfo.ReleaseFuncDesc(funcDescPtr);
            }
        }
    }

    /// <summary>
    /// IN / OUT / IN-OUT is the direction the IDL declares. A pointer parameter
    /// declared [out] is what shows up in .NET as a `ref`/`out` argument.
    /// </summary>
    private static string DescribeDirection(PARAMFLAG flags)
    {
        var isIn = flags.HasFlag(PARAMFLAG.PARAMFLAG_FIN);
        var isOut = flags.HasFlag(PARAMFLAG.PARAMFLAG_FOUT);

        if (isIn && isOut) return "in/out";
        if (isOut) return "out";
        if (isIn) return "in";
        return "unspecified";
    }

    /// <summary>
    /// Renders a TYPEDESC as readable text, following VT_PTR chains so that a
    /// `LONG*` out-parameter is reported as `LONG*` rather than as an opaque
    /// pointer.
    /// </summary>
    private static string DescribeTypeDesc(TYPEDESC typeDesc, int depth = 0)
    {
        if (depth > 4)
        {
            return "…";
        }

        var vt = (VarEnum)typeDesc.vt;

        switch (vt)
        {
            case VarEnum.VT_PTR:
            {
                if (typeDesc.lpValue == IntPtr.Zero) return "void*";
                var pointee = Marshal.PtrToStructure<TYPEDESC>(typeDesc.lpValue);
                return $"{DescribeTypeDesc(pointee, depth + 1)}*";
            }

            case VarEnum.VT_SAFEARRAY:
            {
                if (typeDesc.lpValue == IntPtr.Zero) return "SAFEARRAY";
                var element = Marshal.PtrToStructure<TYPEDESC>(typeDesc.lpValue);
                return $"SAFEARRAY({DescribeTypeDesc(element, depth + 1)})";
            }

            default:
                return FriendlyVariantName(vt);
        }
    }

    /// <summary>Maps VARTYPE onto the names the ZKTeco SDK documentation uses.</summary>
    private static string FriendlyVariantName(VarEnum vt) => vt switch
    {
        VarEnum.VT_EMPTY => "void",
        VarEnum.VT_VOID => "void",
        VarEnum.VT_I2 => "SHORT",
        VarEnum.VT_I4 => "LONG",
        VarEnum.VT_INT => "int",
        VarEnum.VT_UI4 => "ULONG",
        VarEnum.VT_R4 => "FLOAT",
        VarEnum.VT_R8 => "DOUBLE",
        VarEnum.VT_BSTR => "BSTR",
        VarEnum.VT_BOOL => "VARIANT_BOOL",
        VarEnum.VT_VARIANT => "VARIANT",
        VarEnum.VT_DISPATCH => "IDispatch",
        VarEnum.VT_UNKNOWN => "IUnknown",
        VarEnum.VT_HRESULT => "HRESULT",
        VarEnum.VT_DATE => "DATE",
        VarEnum.VT_UI1 => "BYTE",
        _ => vt.ToString(),
    };

    private static string BuildDeclaration(SdkMethodSignature signature)
    {
        var parameters = signature.Parameters.Select(p =>
        {
            var direction = p.Direction == "unspecified" ? string.Empty : $"[{p.Direction}";
            var optional = p.IsOptional ? ", optional" : string.Empty;
            var suffix = direction.Length > 0 ? $"{direction}{optional}] " : string.Empty;
            return $"{suffix}{p.Type} {p.Name}";
        });

        return $"{signature.ReturnType} {signature.Name}({string.Join(", ", parameters)})";
    }
}
