#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

// Phase 1: Check if Docker CLI binary is installed and present in PATH
const checkBin = spawnSync("docker", ["--version"], { stdio: "pipe" });
if (checkBin.error) {
  const err = /** @type {NodeJS.ErrnoException} */ (checkBin.error);
  if (err.code === "ENOENT") {
    console.error("\x1b[31m[ERROR] Docker is not installed or not found in PATH.\x1b[0m");
    console.error("Requirement R2: Docker is required to run the local container test harness.");
    console.error(
      "Please install Docker Desktop or Docker Engine and ensure 'docker' is in your PATH.",
    );
    process.exit(1);
  }
  console.error(`\x1b[31m[ERROR] Failed to execute docker: ${checkBin.error.message}\x1b[0m`);
  process.exit(1);
}
if (checkBin.status !== 0) {
  console.error("\x1b[31m[ERROR] Docker is not installed or not found in PATH.\x1b[0m");
  console.error("Requirement R2: Docker command exited with non-zero status during binary check.");
  process.exit(1);
}

// Phase 2: Check if Docker daemon is running and reachable (5 second timeout)
const checkDaemon = spawnSync("docker", ["info"], {
  stdio: "pipe",
  timeout: 5000,
});

if (checkDaemon.status !== 0 || checkDaemon.error) {
  console.error("\x1b[31m[ERROR] Docker daemon is not running or unreachable.\x1b[0m");
  console.error(
    "Requirement R2: The local container test harness requires an active Docker daemon.",
  );
  const stderr = checkDaemon.stderr?.toString().trim();
  if (stderr) {
    console.error(`Details: ${stderr}`);
  }
  console.error("Please ensure Docker Desktop (or the dockerd service) is started and responsive.");
  process.exit(1);
}

// Phase 3: Build the throwaway container image
const IMAGE_TAG = "agy-boost-test-harness:local";
console.log(`[test:docker] Building test container image (${IMAGE_TAG})...`);

const buildRes = spawnSync(
  "docker",
  ["build", "-f", "tests/tooling/docker/Dockerfile.test", "-t", IMAGE_TAG, "."],
  { stdio: "inherit" },
);

if (buildRes.status !== 0) {
  console.error("\x1b[31m[ERROR] Failed to build test harness container image.\x1b[0m");
  process.exit(buildRes.status ?? 1);
}

// Phase 4: Run test suite inside isolated throwaway container
const userArgs = process.argv.slice(2);
const runArgs = [
  "run",
  "--rm",
  "-t",
  "--init",
  IMAGE_TAG,
  ...(userArgs.length > 0 ? userArgs : ["pnpm", "run", "test:all"]),
];

console.log("[test:docker] Executing test suite in isolated Linux container...");
const containerProc = spawn("docker", runArgs, { stdio: "inherit" });

containerProc.on("error", (err) => {
  console.error(`\x1b[31m[ERROR] Failed to run test container: ${err.message}\x1b[0m`);
  process.exit(1);
});

/** @param {NodeJS.Signals} sig */
const forwardSignal = (sig) => {
  if (containerProc && !containerProc.killed) {
    containerProc.kill(sig);
  }
};
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

containerProc.on("exit", (code, signal) => {
  if (code !== null) {
    process.exit(code);
  }
  if (signal === "SIGINT") {
    process.exit(130);
  }
  if (signal === "SIGTERM") {
    process.exit(143);
  }
  process.exit(1);
});
