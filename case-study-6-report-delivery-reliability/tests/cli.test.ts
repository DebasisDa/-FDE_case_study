import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { main } from "../src/cli";
import { buildReport } from "../src/report";
import { SEED_PATH, loadSeedJobs } from "./support";

describe("cli", () => {
  it("writes the report for the seed log", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-report-"));
    const output = path.join(dir, "delivery-report.json");
    expect(main(["--input", SEED_PATH, "--output", output])).toBe(0);
    const written = JSON.parse(fs.readFileSync(output, "utf8")) as unknown;
    expect(written).toEqual(buildReport(loadSeedJobs()));
  });

  it("returns 0 for help and 1 for a missing log or unknown flag", () => {
    expect(main(["--help"])).toBe(0);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-report-"));
    const output = path.join(dir, "delivery-report.json");
    expect(main(["--input", path.join(dir, "missing.json"), "--output", output])).toBe(1);
    expect(fs.existsSync(output)).toBe(false);
    expect(main(["--nope"])).toBe(1);
    expect(main(["--input"])).toBe(1);
  });
});
