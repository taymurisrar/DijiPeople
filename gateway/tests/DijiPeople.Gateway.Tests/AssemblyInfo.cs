using Xunit;

// Several suites drive a real child process and select its behaviour through a
// process-wide environment variable. Running them concurrently would let one
// test's worker mode leak into another's invocation, which shows up as a
// baffling intermittent failure rather than an honest one.
//
// The suite is fast enough that serialising it costs little, and the alternative
// — passing the mode as an argument — would stop the tests exercising the
// gateway's own command-line construction, which is the part worth covering.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
