import { buildReport } from "../src/report";
import type { DeliveryReport } from "../src/report";
import type { JobAttempt } from "../src/jobs";
import { assertContract, attempt } from "./support";

function onlyRun(...jobs: JobAttempt[]): DeliveryReport {
  const report = buildReport(jobs);
  expect(report.runs).toHaveLength(1);
  return report;
}

describe("classify", () => {
  it("normalizes status text and does not mutate the job", () => {
    const job = attempt("R-1", "J-1", 1, " ERROR ");
    const report = onlyRun(job);
    expect(job.status).toBe(" ERROR ");
    expect(report.runs[0].latest_status).toBe("error");
    expect(report.runs[0].attempts[0].logged_status).toBe(" ERROR ");
    expect(report.runs[0].outcome).toBe("retry");
    expect(report.runs[0].rule).toBe("failure_retry");
  });

  it("retries a single timeout as the first retry", () => {
    const report = onlyRun(attempt("R-1", "J-9", 4, "timed_out"));
    expect(report.runs[0].outcome).toBe("retry");
    expect(report.runs[0].rule).toBe("timeout_first_retry");
    expect(report.runs[0].next_attempt_number).toBe(5);
    expect(report.retries[0].attempt_number).toBe(5);
    assertContract(report);
  });

  it("stops at two timeouts even with attempts left in the budget", () => {
    const report = onlyRun(
      attempt("R-1", "J-1", 1, "timed_out"),
      attempt("R-1", "J-2", 2, "timed_out", "2026-09-01T02:10:00"),
    );
    expect(report.runs[0].outcome).toBe("escalate");
    expect(report.runs[0].rule).toBe("timeout_ceiling");
    expect(report.retries).toHaveLength(0);
  });

  it("retries a failure that followed one timeout", () => {
    const report = onlyRun(
      attempt("R-1", "J-1", 1, "timed_out"),
      attempt("R-1", "J-2", 2, "failed", "2026-09-01T02:10:00"),
    );
    expect(report.runs[0].outcome).toBe("retry");
    expect(report.runs[0].rule).toBe("failure_retry");
    expect(report.runs[0].next_attempt_number).toBe(3);
  });

  it("does not retry a timeout once a retry has already been made", () => {
    const report = onlyRun(
      attempt("R-1", "J-1", 1, "failed"),
      attempt("R-1", "J-2", 2, "timed_out", "2026-09-01T02:10:00"),
    );
    expect(report.runs[0].outcome).toBe("escalate");
    expect(report.runs[0].rule).toBe("timeout_not_first_retry");
    expect(report.retries).toHaveLength(0);
  });

  it("retries failed and error while fewer than 3 attempts exist", () => {
    const twoFailures = onlyRun(
      attempt("R-1", "J-1", 1, "failed"),
      attempt("R-1", "J-2", 2, "error", "2026-09-01T02:10:00"),
    );
    expect(twoFailures.runs[0].outcome).toBe("retry");
    expect(twoFailures.runs[0].next_attempt_number).toBe(3);

    const threeFailures = onlyRun(
      attempt("R-2", "J-1", 1, "failed"),
      attempt("R-2", "J-2", 2, "failed", "2026-09-01T02:10:00"),
      attempt("R-2", "J-3", 3, "error", "2026-09-01T02:20:00"),
    );
    expect(threeFailures.runs[0].outcome).toBe("escalate");
    expect(threeFailures.runs[0].rule).toBe("attempt_ceiling");
  });

  it("uses max attempt number plus one across a numbering gap", () => {
    const report = onlyRun(
      attempt("R-1", "J-1", 1, "failed"),
      attempt("R-1", "J-4", 4, "failed", "2026-09-01T02:10:00"),
    );
    expect(report.runs[0].attempt_count).toBe(2);
    expect(report.runs[0].outcome).toBe("retry");
    expect(report.retries[0].attempt_number).toBe(5);
  });

  it("waits on every in-flight status and does not retry over it", () => {
    for (const status of ["running", "in_progress", "queued", "pending"]) {
      const report = onlyRun(
        attempt("R-1", "J-1", 1, "failed"),
        attempt("R-1", "J-2", 2, status, "2026-09-01T02:10:00"),
      );
      expect({ status, outcome: report.runs[0].outcome, rule: report.runs[0].rule }).toEqual({
        status,
        outcome: "in progress",
        rule: "in_flight",
      });
      expect(report.retries).toHaveLength(0);
    }
  });

  it("escalates an unknown status and never retries it", () => {
    const latestUnknown = onlyRun(attempt("R-1", "J-1", 1, "cancelled"));
    expect(latestUnknown.runs[0].outcome).toBe("escalate");
    expect(latestUnknown.runs[0].rule).toBe("unknown_status");
    expect(latestUnknown.runs[0].reason).toMatch(/cancelled/);

    const earlierUnknown = onlyRun(
      attempt("R-2", "J-1", 1, "cancelled"),
      attempt("R-2", "J-2", 2, "failed", "2026-09-01T02:10:00"),
    );
    expect(earlierUnknown.runs[0].rule).toBe("unknown_status");
    expect(earlierUnknown.retries).toHaveLength(0);

    const blank = onlyRun(attempt("R-3", "J-9", 1, "   "));
    expect(blank.runs[0].reason).toMatch(/\(blank\)/);
  });

  it("lets one completed attempt close the run", () => {
    const laterFailure = onlyRun(
      attempt("R-1", "J-1", 1, "completed"),
      attempt("R-1", "J-2", 2, "failed", "2026-09-01T02:10:00"),
    );
    expect(laterFailure.runs[0].outcome).toBe("delivered");
    expect(laterFailure.retries).toHaveLength(0);

    const completedAfterUnknown = onlyRun(
      attempt("R-2", "J-1", 1, "cancelled"),
      attempt("R-2", "J-2", 2, " Completed ", "2026-09-01T02:10:00"),
    );
    expect(completedAfterUnknown.runs[0].outcome).toBe("delivered");
    expect(completedAfterUnknown.runs[0].reason).toMatch(/J-2 completed/);
  });

  it("orders attempts by attempt number, then scheduled time, then file order", () => {
    const report = onlyRun(
      attempt("R-1", "J-late", 1, "failed", "2026-09-01T02:10:00"),
      attempt("R-1", "J-early", 1, "failed", "2026-09-01T02:00:00"),
      attempt("R-1", "J-tie-b", 2, "failed", "2026-09-01T03:00:00"),
      attempt("R-1", "J-tie-a", 2, "error", "2026-09-01T03:00:00"),
    );
    expect(report.runs[0].attempts.map((item) => item.job_id)).toEqual(["J-early", "J-late", "J-tie-b", "J-tie-a"]);
    expect(report.runs[0].latest_job_id).toBe("J-tie-a");
    expect(report.runs[0].outcome).toBe("escalate");
  });

  it("waits when a live attempt is still open ahead of a timeout ceiling", () => {
    const report = onlyRun(
      attempt("R-1", "J-1", 1, "timed_out"),
      attempt("R-1", "J-2", 2, "timed_out", "2026-09-01T02:10:00"),
      attempt("R-1", "J-3", 3, "running", "2026-09-01T02:20:00"),
    );
    expect(report.runs[0].outcome).toBe("in progress");
    expect(report.retries).toHaveLength(0);
  });
});
