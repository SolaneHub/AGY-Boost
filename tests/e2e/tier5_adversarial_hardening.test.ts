import { test as it, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import {
  PROJECT_ROOT,
  runCommand,
  createTempWorkspace,
  parseScorecardTable,
} from "./helpers/e2e-harness.js";

describe("Tier 5: Adversarial Hardening (White-Box & Edge-Case Stress)", () => {
  // =========================================================================
  // Subsuite 1: Requirement R1 — scripts/build.go release-gate Hardening
  // =========================================================================
  describe("R1: scripts/build.go release-gate Adversarial Verification", () => {
    it("T5.1.1: CLI argument parser rejects unrecognized flags and displays usage with exit code 1", async () => {
      const invalidFlags = ["--help", "--verbose", "--dry-run", "-v", "-h", "--unknown-flag-xyz"];
      for (const flag of invalidFlags) {
        const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate", flag], {
          cwd: PROJECT_ROOT,
          timeoutMs: 10_000,
        });

        assert.equal(
          res.exitCode,
          1,
          `Expected exit code 1 for invalid flag '${flag}', got ${res.exitCode}`,
        );
        assert.ok(
          res.stderr.includes(`Unknown flag for release-gate: ${flag}`),
          `Expected stderr to report unknown flag '${flag}'. Got: ${res.stderr}`,
        );
        assert.ok(
          res.stdout.includes("Usage: go run ./scripts/build.go") ||
            res.stdout.includes("release-gate"),
          "Stdout should display usage instructions on unrecognized flag",
        );
      }
    });

    it("T5.1.2: CLI argument parser rejects unexpected positional arguments with exit code 1", async () => {
      const unexpectedArgs = ["unexpected_arg", "foo", "123", "target"];
      for (const arg of unexpectedArgs) {
        const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate", arg], {
          cwd: PROJECT_ROOT,
          timeoutMs: 10_000,
        });

        assert.equal(
          res.exitCode,
          1,
          `Expected exit code 1 for positional arg '${arg}', got ${res.exitCode}`,
        );
        assert.ok(
          res.stderr.includes(`Unknown flag for release-gate: ${arg}`),
          `Expected stderr to report unknown flag for positional arg '${arg}'. Got: ${res.stderr}`,
        );
      }
    });

    it("T5.1.3: CLI argument parser rejects malformed --fail-at flag missing '=' with exit code 1", async () => {
      const malformed = ["--fail-at", "--fail-at format:check", "-fail-at=format:check"];
      for (const arg of malformed) {
        const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate", arg], {
          cwd: PROJECT_ROOT,
          timeoutMs: 10_000,
        });

        assert.equal(
          res.exitCode,
          1,
          `Expected exit code 1 for malformed flag '${arg}', got ${res.exitCode}`,
        );
        assert.ok(
          res.stderr.includes(`Unknown flag for release-gate: ${arg}`),
          `Expected stderr to report unknown flag for '${arg}'. Got: ${res.stderr}`,
        );
      }
    });

    it("T5.1.4: Exhaustive validation of --fail-at=<step> rejects invalid or partial step names", async () => {
      const invalidSteps = [
        "",
        "format",
        "check",
        "build",
        "all",
        "test",
        "nonexistent_step",
        "FORMAT:CHECK",
        "format:check ",
        " format:check",
        "format:check\n",
        "format:check; rm -rf /",
      ];

      for (const step of invalidSteps) {
        const arg = `--fail-at=${step}`;
        const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate", arg], {
          cwd: PROJECT_ROOT,
          timeoutMs: 10_000,
        });

        assert.equal(
          res.exitCode,
          1,
          `Expected exit code 1 for invalid step '${arg}', got ${res.exitCode}`,
        );
        assert.ok(
          res.stderr.includes(`Invalid step for --fail-at: ${step}`),
          `Expected invalid step error for '${step}'. Got: ${res.stderr}`,
        );
      }
    });

    it("T5.1.5: Fail-fast cascade at Step 1 marks step 1 FAILED and steps 2-8 SKIPPED (0.00s)", async () => {
      const res = await runCommand(
        "go",
        ["run", "./scripts/build.go", "release-gate", "--fail-at=format:check"],
        {
          cwd: PROJECT_ROOT,
          timeoutMs: 30_000,
        },
      );

      assert.equal(
        res.exitCode,
        1,
        `Expected exit code 1 on failed release gate, got ${res.exitCode}`,
      );
      assert.ok(
        res.stdout.includes("Result: FAILED AT STEP 1 (format:check)"),
        `Scorecard footer must note failed step 1. Output:\n${res.stdout}`,
      );

      const table = parseScorecardTable(res.stdout);
      assert.equal(table.rows.length, 8, `Expected 8 scorecard rows, got ${table.rows.length}`);

      // Step 1: FAILED
      assert.equal(table.rows[0]?.name, "format:check");
      assert.equal(table.rows[0]?.status.toUpperCase(), "FAILED");

      // Steps 2 through 8: SKIPPED with 0.00s duration
      const expectedSkipped = [
        "lint",
        "typecheck",
        "test:fast",
        "test:stress",
        "test:integration",
        "test:e2e",
        "build:all",
      ];

      for (let i = 1; i < 8; i++) {
        const row = table.rows[i];
        assert.equal(row?.name, expectedSkipped[i - 1]);
        assert.equal(row?.status.toUpperCase(), "SKIPPED", `Step ${row?.name} must be SKIPPED`);
        assert.equal(row?.durationSec, 0, `Step ${row?.name} duration must be 0s`);
        assert.equal(row?.durationRaw, "0.00s", `Step ${row?.name} raw duration must be 0.00s`);
      }
    });

    it("T5.1.6: Fail-fast cascade at Step 2 (lint) executes Step 1 successfully and skips Steps 3-8", async () => {
      const res = await runCommand(
        "go",
        ["run", "./scripts/build.go", "release-gate", "--fail-at=lint"],
        {
          cwd: PROJECT_ROOT,
          timeoutMs: 30_000,
        },
      );

      assert.equal(
        res.exitCode,
        1,
        `Expected exit code 1 on failed release gate, got ${res.exitCode}`,
      );
      assert.ok(
        res.stdout.includes("Result: FAILED AT STEP 2 (lint)"),
        `Scorecard footer must report failure at step 2. Output:\n${res.stdout}`,
      );

      const table = parseScorecardTable(res.stdout);
      assert.equal(table.rows.length, 8);

      // Step 1: PASSED
      assert.equal(table.rows[0]?.name, "format:check");
      assert.equal(table.rows[0]?.status.toUpperCase(), "PASSED");
      assert.ok((table.rows[0]?.durationSec ?? 0) >= 0);

      // Step 2: FAILED
      assert.equal(table.rows[1]?.name, "lint");
      assert.equal(table.rows[1]?.status.toUpperCase(), "FAILED");

      // Steps 3 through 8: SKIPPED with 0.00s
      for (let i = 2; i < 8; i++) {
        const row = table.rows[i];
        assert.equal(row?.status.toUpperCase(), "SKIPPED", `Step ${row?.name} must be SKIPPED`);
        assert.equal(row?.durationSec, 0, `Step ${row?.name} duration must be 0s`);
        assert.equal(row?.durationRaw, "0.00s", `Step ${row?.name} raw duration must be 0.00s`);
      }
    });

    it("T5.1.7: Scorecard table layout invariant verifies exact 51-character line width alignment", async () => {
      const res = await runCommand(
        "go",
        ["run", "./scripts/build.go", "release-gate", "--fail-at=format:check"],
        {
          cwd: PROJECT_ROOT,
          timeoutMs: 20_000,
        },
      );

      const lines = res.stdout.split(/\r?\n/);
      const tableLines = lines.filter((l) => l.startsWith("|") || l.startsWith("+"));

      assert.ok(
        tableLines.length >= 11,
        `Expected at least 11 table lines, got ${tableLines.length}`,
      );

      for (const line of tableLines) {
        assert.equal(
          line.length,
          51,
          `Table line has incorrect width (${line.length} != 51): '${line}'`,
        );
      }
    });

    it("T5.1.8: Cross-platform dispatcher architecture inspects cmd.exe on Windows vs direct on POSIX", async () => {
      const buildGoPath = path.join(PROJECT_ROOT, "scripts", "build.go");
      const content = await fs.readFile(buildGoPath, "utf8");

      assert.ok(
        content.includes('runtime.GOOS == "windows"'),
        "scripts/build.go must check runtime.GOOS == 'windows' for process dispatch",
      );
      assert.ok(
        content.includes('exec.Command("cmd.exe", "/c", "pnpm", "run", step.Name)'),
        "scripts/build.go must dispatch via cmd.exe /c pnpm run on Windows",
      );
      assert.ok(
        content.includes('exec.Command("pnpm", "run", step.Name)'),
        "scripts/build.go must dispatch direct pnpm run on POSIX",
      );
    });
  });

  // =========================================================================
  // Subsuite 2: Requirement R2 — tests/tooling/docker/ Local Container Harness
  // =========================================================================
  describe("R2: Docker Container Harness Adversarial Robustness", () => {
    it("T5.2.1: Phase 1 detects missing docker in PATH and exits with 1 without invoking daemon check", async () => {
      const ws = await createTempWorkspace("agy-nodocker-");
      try {
        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: ws.dir,
          },
        });

        assert.equal(
          res.exitCode,
          1,
          `Expected exit code 1 when docker missing, got ${res.exitCode}`,
        );
        assert.ok(
          res.stderr.includes("[ERROR] Docker is not installed or not found in PATH."),
          `stderr must contain explicit missing Docker message. Got:\n${res.stderr}`,
        );
        assert.ok(
          res.stderr.includes("Requirement R2:"),
          "stderr must reference Requirement R2 in error details",
        );
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.2: Phase 1 detects corrupted docker CLI binary exiting 127 on --version", async () => {
      const ws = await createTempWorkspace("agy-corrupt-docker-");
      try {
        const scriptPath = path.join(
          ws.dir,
          process.platform === "win32" ? "docker.cmd" : "docker",
        );
        const scriptContent =
          process.platform === "win32"
            ? "@echo off\r\necho Corrupted docker CLI >&2\r\nexit /b 127\r\n"
            : "#!/bin/sh\necho 'Corrupted docker CLI' >&2\nexit 127\n";

        await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: `${ws.dir}${path.delimiter}${process.env["PATH"] ?? ""}`,
          },
        });

        assert.equal(res.exitCode, 1);
        assert.ok(
          res.stderr.includes("[ERROR] Docker is not installed or not found in PATH."),
          `stderr must report missing/unusable docker on --version failure. Got: ${res.stderr}`,
        );
        assert.ok(res.stderr.includes("Requirement R2:"), "stderr must reference Requirement R2");
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.3: Phase 2 detects stopped daemon with exit code 1 and surfaces daemon error details", async () => {
      const ws = await createTempWorkspace("agy-daemon-down-");
      try {
        const scriptPath = path.join(
          ws.dir,
          process.platform === "win32" ? "docker.cmd" : "docker",
        );
        const scriptContent =
          process.platform === "win32"
            ? `@echo off\r\nif "%1"=="--version" ( echo Docker version 27.0.0 & exit /b 0 )\r\nif "%1"=="info" ( echo error during connect: daemon not reachable >&2 & exit /b 1 )\r\nexit /b 0\r\n`
            : `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Docker version 27.0.0"; exit 0; fi\nif [ "$1" = "info" ]; then echo "error during connect: daemon not reachable" >&2; exit 1; fi\nexit 0\n`;

        await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: `${ws.dir}${path.delimiter}${process.env["PATH"] ?? ""}`,
          },
        });

        assert.equal(res.exitCode, 1);
        assert.ok(
          res.stderr.includes("[ERROR] Docker daemon is not running or unreachable."),
          `stderr must report unreachable daemon. Got: ${res.stderr}`,
        );
        assert.ok(
          res.stderr.includes("error during connect: daemon not reachable"),
          `stderr must include captured daemon details. Got: ${res.stderr}`,
        );
        assert.ok(res.stderr.includes("Requirement R2:"), "stderr must reference Requirement R2");
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.4: Phase 2 enforces 5000ms probe timeout on hanging docker info", async () => {
      const ws = await createTempWorkspace("agy-timeout-docker-");
      try {
        const scriptPath = path.join(
          ws.dir,
          process.platform === "win32" ? "docker.cmd" : "docker",
        );
        const scriptContent =
          process.platform === "win32"
            ? `@echo off\r\nif "%1"=="--version" ( echo Docker version 27.0.0 & exit /b 0 )\r\nif "%1"=="info" ( powershell -Command "Start-Sleep -Seconds 12" & exit /b 1 )\r\nexit /b 0\r\n`
            : `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Docker version 27.0.0"; exit 0; fi\nif [ "$1" = "info" ]; then exec sleep 12; fi\nexit 0\n`;

        await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

        const start = Date.now();
        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: `${ws.dir}${path.delimiter}${process.env["PATH"] ?? ""}`,
          },
          timeoutMs: 15_000,
        });
        const elapsed = Date.now() - start;

        assert.equal(res.exitCode, 1, `Expected exit code 1 on timeout, got ${res.exitCode}`);
        assert.ok(
          res.stderr.includes("[ERROR] Docker daemon is not running or unreachable."),
          `stderr must report unreachable daemon on timeout. Got: ${res.stderr}`,
        );
        assert.ok(
          elapsed >= 4800 && elapsed <= 9000,
          `Expected timeout around 5000ms, elapsed was ${elapsed}ms`,
        );
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.5: run.mjs forwards SIGINT to container subprocess and exits with code 130", async (t) => {
      if (process.platform === "win32") {
        t.skip("Signal propagation tests with POSIX exit codes are tested in POSIX environments");
        return;
      }

      const ws = await createTempWorkspace("agy-sigint-docker-");
      try {
        const scriptPath = path.join(ws.dir, "docker");
        const scriptContent = `#!/bin/sh
if [ "$1" = "--version" ] || [ "$1" = "info" ] || [ "$1" = "build" ]; then
  exit 0
fi
if [ "$1" = "run" ]; then
  trap 'exit 130' INT
  while true; do
    sleep 0.1
  done
fi
exit 0
`;
        await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

        const child = spawn(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: `${ws.dir}:${process.env["PATH"] ?? ""}`,
          },
          stdio: "pipe",
        });

        await new Promise((r) => setTimeout(r, 600));
        child.kill("SIGINT");

        const exitCode = await new Promise((resolve) => child.on("exit", (code) => resolve(code)));
        assert.equal(exitCode, 130, `Expected exit code 130 on SIGINT forward, got ${exitCode}`);
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.6: run.mjs forwards SIGTERM to container subprocess and exits with code 143", async (t) => {
      if (process.platform === "win32") {
        t.skip("Signal propagation tests with POSIX exit codes are tested in POSIX environments");
        return;
      }

      const ws = await createTempWorkspace("agy-sigterm-docker-");
      try {
        const scriptPath = path.join(ws.dir, "docker");
        const scriptContent = `#!/bin/sh
if [ "$1" = "--version" ] || [ "$1" = "info" ] || [ "$1" = "build" ]; then
  exit 0
fi
if [ "$1" = "run" ]; then
  trap 'exit 143' TERM
  while true; do
    sleep 0.1
  done
fi
exit 0
`;
        await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

        const child = spawn(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: `${ws.dir}:${process.env["PATH"] ?? ""}`,
          },
          stdio: "pipe",
        });

        await new Promise((r) => setTimeout(r, 600));
        child.kill("SIGTERM");

        const exitCode = await new Promise((resolve) => child.on("exit", (code) => resolve(code)));
        assert.equal(exitCode, 143, `Expected exit code 143 on SIGTERM forward, got ${exitCode}`);
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.7: run.mjs forwards complex CLI arguments verbatim to container run command", async () => {
      const ws = await createTempWorkspace("agy-args-docker-");
      try {
        const recordedPath = path.join(ws.dir, "args.json");
        const scriptPath = path.join(
          ws.dir,
          process.platform === "win32" ? "docker.cmd" : "docker",
        );

        const scriptContent =
          process.platform === "win32"
            ? `@echo off\r
if "%1"=="--version" exit /b 0\r
if "%1"=="info" exit /b 0\r
if "%1"=="build" exit /b 0\r
if "%1"=="run" (\r
  shift\r
  :loop\r
  if "%1"=="" goto end\r
  if "%1"=="agy-boost-test-harness:local" ( shift & goto capture )\r
  shift\r
  goto loop\r
  :capture\r
  node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" "${recordedPath.replace(/\\/g, "/")}" %*\r
  exit /b 0\r
)\r
exit /b 0\r
`
            : `#!/bin/sh
if [ "$1" = "--version" ] || [ "$1" = "info" ] || [ "$1" = "build" ]; then
  exit 0
fi
if [ "$1" = "run" ]; then
  shift
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "agy-boost-test-harness:local" ]; then
      shift
      break
    fi
    shift
  done
  node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" "${recordedPath}" "$@"
  exit 0
fi
exit 0
`;

        await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

        const complexArgs = [
          "--filter",
          "package with spaces",
          "--pattern=^T[0-9]+: (test|spec)$",
          "quoted 'single' and \"double\"",
          "",
          "--flag-with-equal=value=42",
        ];

        const res = await runCommand(
          process.execPath,
          ["tests/tooling/docker/run.mjs", ...complexArgs],
          {
            cwd: PROJECT_ROOT,
            env: {
              ...process.env,
              PATH: `${ws.dir}${path.delimiter}${process.env["PATH"] ?? ""}`,
            },
          },
        );

        assert.equal(
          res.exitCode,
          0,
          `Expected code 0, got ${res.exitCode}. stderr: ${res.stderr}`,
        );
        const recorded = JSON.parse(await fs.readFile(recordedPath, "utf8"));
        assert.deepEqual(
          recorded,
          complexArgs,
          "CLI arguments must match verbatim without distortion",
        );
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.8: run.mjs defaults container command to ['pnpm', 'run', 'test:all'] when no user args given", async () => {
      const ws = await createTempWorkspace("agy-defargs-docker-");
      try {
        const recordedPath = path.join(ws.dir, "args.json");
        const scriptPath = path.join(
          ws.dir,
          process.platform === "win32" ? "docker.cmd" : "docker",
        );

        const scriptContent =
          process.platform === "win32"
            ? `@echo off\r
if "%1"=="--version" exit /b 0\r
if "%1"=="info" exit /b 0\r
if "%1"=="build" exit /b 0\r
if "%1"=="run" (\r
  shift\r
  :loop\r
  if "%1"=="" goto end\r
  if "%1"=="agy-boost-test-harness:local" ( shift & goto capture )\r
  shift\r
  goto loop\r
  :capture\r
  node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" "${recordedPath.replace(/\\/g, "/")}" %*\r
  exit /b 0\r
)\r
exit /b 0\r
`
            : `#!/bin/sh
if [ "$1" = "--version" ] || [ "$1" = "info" ] || [ "$1" = "build" ]; then
  exit 0
fi
if [ "$1" = "run" ]; then
  shift
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "agy-boost-test-harness:local" ]; then
      shift
      break
    fi
    shift
  done
  node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" "${recordedPath}" "$@"
  exit 0
fi
exit 0
`;

        await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: `${ws.dir}${path.delimiter}${process.env["PATH"] ?? ""}`,
          },
        });

        assert.equal(res.exitCode, 0, `Expected code 0, got ${res.exitCode}`);
        const recorded = JSON.parse(await fs.readFile(recordedPath, "utf8"));
        assert.deepEqual(recorded, ["pnpm", "run", "test:all"]);
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.9: .dockerignore contains exhaustive exclusions for all build outputs, temporary files, and metadata", async () => {
      const ignorePath = path.join(PROJECT_ROOT, ".dockerignore");
      const content = await fs.readFile(ignorePath, "utf8");
      const rules = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));

      const requiredExclusions = [
        "node_modules/",
        "**/node_modules/",
        "dist/",
        "**/dist/",
        "build/",
        "**/build/",
        "bin/",
        "**/bin/",
        ".git/",
        "**/.git/",
        ".agents/",
        "**/.agents/",
        ".gemini/",
        "**/.gemini/",
        "tmp/",
        "**/tmp/",
        "*.tmp",
        "**/*.tmp",
        "*.log",
        "**/*.log",
        ".DS_Store",
        "**/.DS_Store",
        "Thumbs.db",
        "**/Thumbs.db",
        "coverage/",
        "*.test",
        "agy-boost",
        "*.exe",
        ".vscode/",
        ".idea/",
      ];

      for (const excl of requiredExclusions) {
        assert.ok(
          rules.includes(excl),
          `.dockerignore must include exact rule '${excl}' to prevent context bloat or host leakage`,
        );
      }
    });

    it("T5.2.10: Dockerfile.test specifies complete multi-stage build with pinned versions and dependencies", async () => {
      const dockerfilePath = path.join(
        PROJECT_ROOT,
        "tests",
        "tooling",
        "docker",
        "Dockerfile.test",
      );
      const content = await fs.readFile(dockerfilePath, "utf8");

      assert.ok(content.includes("golang:1.24"), "Must use Go 1.24 base image");
      assert.ok(content.includes("node:22-bookworm-slim"), "Must use Node 22 slim Debian runtime");
      assert.ok(content.includes("chromium"), "Must install headless chromium for UI tests");
      assert.ok(content.includes("pnpm@10.27.0"), "Must enable pnpm@10.27.0");
      assert.ok(content.includes("CHROME_BIN=/usr/bin/chromium"), "Must set CHROME_BIN env var");
      assert.ok(content.includes("CI=true"), "Must set CI=true");
      assert.ok(
        content.includes('CMD ["pnpm", "run", "test:all"]'),
        "Default CMD must run test:all",
      );
    });
  });
});
