/**
 * The marker a server-side 429 carries across the React Server Components
 * boundary (DP-QA-024).
 *
 * In a production build the client error boundary never sees a server
 * component's message or status, only `digest`. Next keeps a digest the thrown
 * error already has, so an `ApiRequestError` for a 429 sets this and the
 * boundary can say "slow down" instead of the generic crash screen.
 */
export const RATE_LIMITED_DIGEST = "DP_RATE_LIMITED";
