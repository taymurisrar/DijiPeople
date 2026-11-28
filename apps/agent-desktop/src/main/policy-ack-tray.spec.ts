import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Found by the real-Electron privacy journey (e2e/electron/agent-dlp-privacy.cjs):
 * after an employee acknowledged the monitoring policy the tray kept saying
 * "Content monitoring: off until you acknowledge the policy", because the tray
 * only redraws on a session event and a config refresh is not one. A unit test
 * cannot run Electron, so this pins the cause in the source: the acknowledgement
 * path must announce a change after it refreshes the config.
 */
const source = readFileSync(join(__dirname, "main.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("acknowledging the monitoring policy", () => {
  it("redraws the tray after the config refresh", () => {
    const ack = source.indexOf("acknowledgeMonitoringPolicy(policy.versionId)");
    expect(ack).toBeGreaterThan(-1);
    const rest = source.slice(ack, ack + 600);
    const refresh = rest.indexOf("await configManager.refresh();");
    const redraw = rest.indexOf('sessionManager.emit("changed");');
    expect(refresh).toBeGreaterThan(-1);
    expect(redraw).toBeGreaterThan(refresh);
  });
});
