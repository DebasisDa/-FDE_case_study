import { buildReport } from "../src/report";
import type { Outcome } from "../src/classify";
import { assertContract, attempt, loadSeedJobs } from "./support";

describe("report", () => {
  const jobs = loadSeedJobs();

  it("classifies every run in the seed", () => {
    const report = buildReport(jobs);
    assertContract(report);
    const outcomes = Object.fromEntries(report.runs.map((run) => [run.run_id, run.outcome]));
    const expected: Record<string, Outcome> = {
      "R-001": "delivered",
      "R-002": "delivered",
      "R-003": "delivered",
      "R-004": "delivered",
      "R-005": "escalate",
      "R-006": "delivered",
      "R-007": "delivered",
      "R-008": "delivered",
      "R-009": "delivered",
      "R-010": "retry",
      "R-011": "delivered",
      "R-012": "delivered",
    };
    expect(outcomes).toEqual(expected);
    expect(report.summary).toEqual({
      run_count: 12,
      delivered: 10,
      retry: 1,
      escalate: 1,
      "in progress": 0,
    });
  });

  it("retries only the open error run, once", () => {
    const report = buildReport(jobs);
    expect(report.retries).toEqual([
      {
        run_id: "R-010",
        tenant_id: "T-05",
        tenant_name: "Epsilon Media",
        report_name: "Monthly Statement",
        scheduled_at: "2026-09-08T02:00:00",
        attempt_number: 2,
        prior_job_id: "J-013",
        prior_status: "error",
      },
    ]);
    const recovered = report.runs.find((run) => run.run_id === "R-003");
    expect(recovered?.outcome).toBe("delivered");
    expect(recovered?.rule).toBe("completed");
    expect(recovered?.reason ?? "").toMatch(/J-004 completed/);
  });

  it("stops Gamma Health after two timeouts", () => {
    const report = buildReport(jobs);
    const gamma = report.runs.find((run) => run.run_id === "R-005");
    expect(gamma).toMatchObject({
      outcome: "escalate",
      rule: "timeout_ceiling",
      timeout_count: 2,
      attempt_count: 3,
      latest_status: "failed",
      next_attempt_number: null,
    });
    expect(gamma?.reason).toMatch(/Two timeouts stop further retries/);
  });

  it("is identical when the input order is reversed", () => {
    expect(buildReport(jobs)).toEqual(buildReport([...jobs].reverse()));
  });

  it("returns an empty report for no jobs", () => {
    const report = buildReport([]);
    assertContract(report);
    expect(report.summary.run_count).toBe(0);
    expect(report.runs).toEqual([]);
    expect(report.retries).toEqual([]);
  });

  it("builds the same report on a second pass", () => {
    const sample = [attempt("R-2", "J-2", 1, "completed"), attempt("R-1", "J-1", 1, "failed")];
    expect(buildReport(sample)).toEqual(buildReport(sample));
  });
});
