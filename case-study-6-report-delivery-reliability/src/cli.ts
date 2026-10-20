import fs from "node:fs";
import path from "node:path";

import { JobLogError, readJobs } from "./jobs";
import { buildReport } from "./report";
import { formatReport, useColor } from "./terminal";

const DEFAULT_INPUT = path.join("starter_kit", "data", "report_jobs.json");
const DEFAULT_OUTPUT = "delivery-report.json";
const HELP = `Usage: node dist/cli.js [--input <path>] [--output <path>]

Read report job attempts and write a delivery report.
Default input: ${DEFAULT_INPUT}
Default output: ${DEFAULT_OUTPUT}`;

function flagValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new JobLogError(`Missing value for ${flag}.`);
  return value;
}

function parseArgs(argv: readonly string[]): { input: string; output: string; help: boolean } {
  const options = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--input" || arg === "--output") {
      options[arg.slice(2) as "input" | "output"] = flagValue(argv, index, arg);
      index += 1;
    } else throw new JobLogError(`Unknown argument: ${arg}`);
  }
  return options;
}

export function main(argv: readonly string[], cwd = process.cwd()): number {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(HELP);
      return 0;
    }
    const outputPath = path.resolve(cwd, options.output);
    const report = buildReport(readJobs(path.resolve(cwd, options.input)));
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatReport(report, outputPath, useColor()));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(useColor(process.stderr) ? `\x1b[31m${message}\x1b[0m` : message);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
