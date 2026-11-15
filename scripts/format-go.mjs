import { spawnSync } from "node:child_process";
import process from "node:process";

const isCheck = process.argv.includes("--check");

if (isCheck) {
  const result = spawnSync("gofmt", ["-l", "-s", "."], { encoding: "utf8" });
  if (result.error) {
    console.error("Error executing gofmt:", result.error);
    process.exit(1);
  }
  const unformatted = result.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (unformatted.length > 0) {
    console.error("The following Go files are not formatted properly:");
    for (const file of unformatted) {
      console.error(`  - ${file}`);
    }
    console.error("\nRun 'pnpm run format' or 'gofmt -w -s .' to fix them.");
    process.exit(1);
  } else {
    console.log("All Go files are properly formatted.");
  }
} else {
  const result = spawnSync("gofmt", ["-w", "-s", "."], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log("Formatted Go files with gofmt.");
}
