import { redirect } from "next/navigation";

/**
 * Moved into Settings on 2026-08-28 — see the note on the app-releases
 * redirect. Rollout and releases are now two tabs of one screen, because
 * "what exists on a channel" and "who receives that channel" are decisions
 * people make together and got wrong while a click apart.
 */
export default function AgentRolloutRedirect() {
  redirect("/settings/desktop-agent");
}
