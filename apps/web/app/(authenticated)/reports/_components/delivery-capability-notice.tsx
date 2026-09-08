/*
 * "This workspace is not set up to send email."
 *
 * A scheduled report is a promise to put a file in someone's inbox on a timer.
 * When the workspace's only email provider is a CONSOLE or DEV sink that
 * promise cannot be kept, and until now every layer said it had been: the run
 * completed, the delivery log said SENT with a `console_…` message id, and the
 * only trace was a `providerType` field nobody reads. Someone would create a
 * schedule and wait a day for an email that was never going to arrive.
 *
 * Three things this deliberately does not say:
 *
 *   - not "failed", because nothing failed. The report is built and stored, and
 *     it is still downloadable from this screen.
 *   - not an error tone. Amber, not red: this is a configuration fact about the
 *     workspace, not a fault in the schedule the reader is looking at.
 *   - nothing about which provider, or any credential. The person creating a
 *     schedule needs to know the outcome and who can change it.
 */
export function DeliveryCapabilityNotice({
  context,
}: {
  /** Where it is shown, which changes only the first sentence. */
  readonly context: "list" | "dialog";
}) {
  return (
    <div
      className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-amber-900"
      role="status"
    >
      <p className="text-sm font-semibold">
        This workspace is not set up to send email.
      </p>
      <p className="mt-1 text-sm leading-6">
        {context === "dialog"
          ? "This report will still be built and stored on schedule, but it will not be emailed to anyone. "
          : "These reports are still built and stored on schedule, but they are not emailed to anyone. "}
        An administrator can configure a provider in Settings → Email.
      </p>
    </div>
  );
}
