import { buildReport } from "../src/report";
import { formatReport, useColor } from "../src/terminal";
import { attempt, loadSeedJobs } from "./support";

describe("terminal report", () => {
  const report = buildReport(loadSeedJobs());

  it("prints the same facts without color", () => {
    const text = formatReport(report, "delivery-report.json", false);
    expect(text).toContain("Wrote delivery-report.json");
    expect(text).toContain("12 runs: 10 delivered, 1 retry, 1 escalate, 0 in progress");
    expect(text).toContain("Safe to retry: R-010 (attempt 2)");
    expect(text).toContain("Escalate:");
    expect(text).toContain("R-005");
    expect(text).toContain("Two timeouts stop further retries");
    expect(text).toContain("timed_out -> timed_out -> failed");
    expect(text).not.toContain("\x1b[");
  });

  it("colors delivered, retry, and escalate", () => {
    const text = formatReport(report, "delivery-report.json", true);
    expect(text).toContain("\x1b[32m");
    expect(text).toContain("\x1b[33m");
    expect(text).toContain("\x1b[31m");
    expect(text).toContain("\x1b[0m");
  });

  it("includes an in-progress row when a run is still open", () => {
    const open = buildReport([
      attempt("R-1", "J-1", 1, "running"),
    ]);
    const text = formatReport(open, "out.json", false);
    expect(text).toContain("In progress:");
    expect(text).toContain("Do not retry over a live attempt");
  });

  it("follows NO_COLOR and FORCE_COLOR", () => {
    const previousNoColor = process.env.NO_COLOR;
    const previousForce = process.env.FORCE_COLOR;
    try {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = "1";
      expect(useColor()).toBe(true);
      process.env.FORCE_COLOR = "0";
      expect(useColor()).toBe(false);
      process.env.NO_COLOR = "1";
      process.env.FORCE_COLOR = "1";
      expect(useColor()).toBe(false);
    } finally {
      if (previousNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = previousNoColor;
      }
      if (previousForce === undefined) {
        delete process.env.FORCE_COLOR;
      } else {
        process.env.FORCE_COLOR = previousForce;
      }
    }
  });
});
