import { classifyRun } from "../src/classify";
import { parseJobs } from "../src/jobs";

describe("jobs", () => {
  it("rejects a log that is not a jobs array", () => {
    expect(() => parseJobs({})).toThrow(/jobs array/);
    expect(() => parseJobs({ jobs: {} })).toThrow(/jobs must be an array/);
  });

  it("rejects an invalid attempt number and a missing run id", () => {
    expect(() =>
      parseJobs({
        jobs: [
          {
            job_id: "J-1",
            run_id: "R-1",
            tenant_id: "T",
            tenant_name: "T",
            report_name: "R",
            scheduled_at: "t",
            status: "failed",
            attempt_number: 0,
          },
        ],
      }),
    ).toThrow(/attempt_number/);
    expect(() =>
      parseJobs({
        jobs: [
          {
            job_id: "J-1",
            tenant_id: "T",
            tenant_name: "T",
            report_name: "R",
            scheduled_at: "t",
            status: "failed",
            attempt_number: 1,
          },
        ],
      }),
    ).toThrow(/run_id/);
  });

  it("treats a non-string status as blank and keeps a null row count", () => {
    const [job] = parseJobs({
      jobs: [
        {
          job_id: "J-1",
          run_id: "R-1",
          tenant_id: "T",
          tenant_name: "Tenant",
          report_name: "Statement",
          scheduled_at: "2026-09-01T02:00:00",
          status: 5,
          attempt_number: 1,
          row_count: null,
        },
      ],
    });
    expect(job.status).toBe("");
    expect(job.row_count).toBeNull();
    expect(job.duration_seconds).toBeNull();
    const run = classifyRun([job]);
    expect(run.outcome).toBe("escalate");
    expect(run.rule).toBe("unknown_status");
  });
});
