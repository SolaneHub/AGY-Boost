import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

console.log("Running 'go vet ./...'...");
const vetResult = spawnSync("go", ["vet", "./..."], { stdio: "inherit" });
if (vetResult.status !== 0) {
  process.exit(vetResult.status ?? 1);
}

function findGolangciLint() {
  const whichResult = spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["golangci-lint"],
    {
      encoding: "utf8",
    }
  );
  if (whichResult.status === 0 && whichResult.stdout.trim()) {
    return whichResult.stdout.trim().split("\n")[0].trim();
  }

  const gopathResult = spawnSync("go", ["env", "GOPATH"], { encoding: "utf8" });
  if (gopathResult.status === 0 && gopathResult.stdout.trim()) {
    const candidate = path.join(
      gopathResult.stdout.trim(),
      "bin",
      process.platform === "win32" ? "golangci-lint.exe" : "golangci-lint"
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const golangciLint = findGolangciLint();
if (golangciLint) {
  console.log(`Running '${golangciLint} run ./...'...`);
  const lintResult = spawnSync(golangciLint, ["run", "./..."], { stdio: "inherit" });
  if (lintResult.status !== 0) {
    process.exit(lintResult.status ?? 1);
  }
} else {
  console.log(
    "golangci-lint not found; 'go vet' passed. Install golangci-lint for additional checks."
  );
}

console.log("Go lint checks passed.");
