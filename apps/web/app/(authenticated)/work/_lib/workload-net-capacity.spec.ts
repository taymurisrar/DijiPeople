import { readFileSync } from "node:fs";
import path from "node:path";
import {
  WORKLOAD_CAVEAT,
  dayCountLabel,
  loadLabel,
  loadTone,
  type Workload,
} from "./project-work";

const API_SERVICE = path.resolve(
  __dirname,
  "../../../../../../services/api/src/modules/work-items/work-items.service.ts",
);

describe("net capacity wording", () => {
  it("reads leave and holiday days as people say them", () => {
    expect(dayCountLabel(0)).toBe("0 days");
    expect(dayCountLabel(1)).toBe("1 day");
    expect(dayCountLabel(2)).toBe("2 days");
    expect(dayCountLabel(2.5)).toBe("2.5 days");
    expect(dayCountLabel(undefined)).toBe("0 days");
  });

  it("states the truthful basis: own schedule, net of leave and holidays", () => {
    expect(WORKLOAD_CAVEAT).toContain("own schedule, net of approved leave and holidays");
    expect(WORKLOAD_CAVEAT).toContain("plain Monday to Friday");
    expect(WORKLOAD_CAVEAT).toContain("rotating weeks are not yet taken into account");
    expect(WORKLOAD_CAVEAT).not.toContain("not reduced for leave");
    expect(WORKLOAD_CAVEAT).not.toContain("standard week");
  });

  it("says no capacity rather than 0 percent when there is nothing to divide by", () => {
    expect(loadLabel(null)).toBe("No capacity");
    expect(loadLabel(0)).toBe("0%");
    expect(loadTone(null)).toBe("muted");
  });

  it("keeps the client's basis in step with what the API returns", () => {
    const source = readFileSync(API_SERVICE, "utf8").replace(/\r\n/g, "\n");
    const basis = /basis: '(NET_OF_LEAVE_AND_HOLIDAYS)'/.exec(source);
    const limits = /limits: '(NO_HALF_DAY_HOLIDAYS_NO_ROTATION_WEEKS)'/.exec(source);
    // A source scan that matched nothing would pass vacuously.
    expect(basis).not.toBeNull();
    expect(limits).not.toBeNull();
    const sample: Workload = {
      basis: basis![1] as Workload["basis"],
      limits: limits![1] as Workload["limits"],
      capacityMinutes: 9600,
      people: [],
    };
    expect(sample.basis).toBe("NET_OF_LEAVE_AND_HOLIDAYS");
    expect(sample.limits).toBe("NO_HALF_DAY_HOLIDAYS_NO_ROTATION_WEEKS");
  });

  it("keeps the per-person net fields the panel reads", () => {
    const source = readFileSync(API_SERVICE, "utf8").replace(/\r\n/g, "\n");
    for (const field of ["leaveDays", "holidayDays", "netCapacityMinutes", "loadPercent"]) {
      expect(source).toContain(field);
    }
  });
});
