# Electron privacy journey

`agent-dlp-privacy.cjs` drives the real desktop agent against a LOCAL API and a
throwaway database with synthetic users, and asserts the DLP privacy path:
tray off -> policy opens whole in a locked window -> acknowledge -> tray on.

1. Build the agent in full (the main build alone overwrites the renderer):
   `npm --workspace agent-desktop run build`, then restore the tracked
   `src/renderer/*.js` if the build rewrote them (`git diff --stat`).
2. Seed the throwaway DB: `seed-dlp-test-policy.cjs` (refuses non-`_gui`/`_e2e` databases).
3. Run it with the environment variables listed at the top of
   `agent-dlp-privacy.cjs`. Unset `ELECTRON_RUN_AS_NODE`.

It deletes the stored refresh token before and after, uses a private user-data
dir, and refuses any API that is not on localhost. The monitoring policy used is
a TEST copy in the throwaway DB only; the real policy stays an unpublished draft.
