namespace DijiPeople.Gateway.Cloud;

/// <summary>
/// How a cloud call failed, in the terms the gateway actually reacts to.
///
/// The distinction that matters most is <see cref="Unauthorized"/> versus
/// everything else. A transient failure means "keep the punches and try again";
/// a revoked credential means "stop, and tell an administrator", because
/// retrying a revoked credential forever is both useless and noisy.
/// </summary>
public enum CloudFailureKind
{
    /// <summary>Network, DNS, TLS or timeout. Always worth retrying.</summary>
    Transient,

    /// <summary>5xx. The API is up enough to answer but cannot serve. Retryable.</summary>
    ServerError,

    /// <summary>
    /// 401/403. The credential is rejected or the gateway no longer owns the
    /// resource. NOT retryable on a tight loop — it needs an administrator.
    /// </summary>
    Unauthorized,

    /// <summary>
    /// 4xx other than auth. The request itself is wrong, so repeating it
    /// unchanged cannot help.
    /// </summary>
    Rejected,

    /// <summary>The response did not match the contract and was not acted on.</summary>
    InvalidResponse,
}

public sealed class CloudException : Exception
{
    public CloudException(
        CloudFailureKind kind,
        string message,
        int? statusCode = null,
        Exception? innerException = null)
        : base(message, innerException)
    {
        Kind = kind;
        StatusCode = statusCode;
    }

    public CloudFailureKind Kind { get; }
    public int? StatusCode { get; }

    /// <summary>Whether retrying the same call unchanged could ever succeed.</summary>
    public bool IsRetryable =>
        Kind is CloudFailureKind.Transient or CloudFailureKind.ServerError;
}
