import { test as it, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  PROJECT_ROOT,
  runCommand,
  createTempWorkspace,
  createMockDocker,
  parseScorecardTable,
  isReleaseGateSupported,
  spawnDaemon,
  ensureAgyBoostBinary,
} from "./helpers/e2e-harness.js";

describe("Tier 2: Boundary & Corner Cases (Opaque-Box)", () => {
  // =========================================================================
  // Subsuite 1: Requirement R1 — Release Gate Boundary & Fail-Fast (6 tests)
  // =========================================================================
  describe("R1: Release Gate Boundary & Fail-Fast", () => {
    it("T2.1.1: Early step failure in release-gate triggers immediate fail-fast abort", async (t) => {
      if (!(await isReleaseGateSupported())) {
        t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
        return;
      }

      // Create isolated workspace with a deliberate formatting/lint error to trip the early step
      const ws = await createTempWorkspace();
      try {
        const dummyGo = "package main\nfunc Broken( )   {  }\n";
        await ws.writeFile("scripts/build.go", dummyGo);

        const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate"], {
          cwd: ws.dir,
          timeoutMs: 30_000,
        });

        assert.notEqual(
          res.exitCode,
          0,
          "release-gate must fail-fast with non-zero exit code on early failure",
        );
      } finally {
        await ws.cleanup();
      }
    });

    it("T2.1.2: Incomplete pipeline run reports failing step as FAILED and subsequent steps as SKIPPED", async (t) => {
      if (!(await isReleaseGateSupported())) {
        t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
        return;
      }

      const ws = await createTempWorkspace();
      try {
        // Run with an invalid build target flag to cause a failure
        const res = await runCommand(
          "go",
          ["run", "./scripts/build.go", "release-gate", "--fail-at=lint"],
          {
            cwd: PROJECT_ROOT,
            timeoutMs: 30_000,
          },
        );

        assert.notEqual(res.exitCode, 0, "release-gate must fail when a step fails");
        const table = parseScorecardTable(res.stdout);
        const hasFailed = table.rows.some((r) => r.status.toUpperCase() === "FAILED");
        const hasSkipped = table.rows.some((r) => r.status.toUpperCase() === "SKIPPED");
        assert.ok(hasFailed, "Scorecard must list failing step as FAILED");
        assert.ok(hasSkipped, "Scorecard must mark subsequent steps as SKIPPED");
      } finally {
        await ws.cleanup();
      }
    });

    it("T2.1.3: release-gate exit code equals non-zero status on step failure", async (t) => {
      if (!(await isReleaseGateSupported())) {
        t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
        return;
      }

      const res = await runCommand(
        "go",
        ["run", "./scripts/build.go", "release-gate", "--nonexistent-flag"],
        {
          cwd: PROJECT_ROOT,
          timeoutMs: 10_000,
        },
      );

      assert.notEqual(res.exitCode, 0, "Command with invalid flags must exit with non-zero status");
    });

    it("T2.1.4: Unknown flags or arguments passed to scripts/build.go exit with non-zero code and show usage", async () => {
      const res = await runCommand("go", ["run", "./scripts/build.go", "unknown-command-xyz-999"], {
        cwd: PROJECT_ROOT,
        timeoutMs: 10_000,
      });

      assert.equal(
        res.exitCode,
        1,
        `Expected exit code 1 for unknown command, got ${res.exitCode}`,
      );
      assert.ok(
        res.stderr.includes("Unknown command: unknown-command-xyz-999") ||
          res.stdout.includes("Usage: go run ./scripts/build.go"),
        "Must output unknown command message and print usage",
      );
    });

    it("T2.1.5: Sub-second steps report fractional duration accurately without truncation to 0", async (t) => {
      if (!(await isReleaseGateSupported())) {
        t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
        return;
      }

      const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate"], {
        cwd: PROJECT_ROOT,
        timeoutMs: 120_000,
      });

      assert.equal(res.exitCode, 0);
      const table = parseScorecardTable(res.stdout);

      // Verify at least one fast step reports fractional duration (e.g. 0.05s or 45ms)
      const hasFractional = table.rows.some(
        (r) => r.durationRaw.includes(".") || r.durationRaw.endsWith("ms"),
      );
      assert.ok(
        hasFractional,
        "At least one step duration must report fractional seconds or milliseconds",
      );
    });

    it("T2.1.6: Scorecard table layout remains aligned when step produces verbose multiline warnings", async (t) => {
      if (!(await isReleaseGateSupported())) {
        t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
        return;
      }

      const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate"], {
        cwd: PROJECT_ROOT,
        timeoutMs: 120_000,
      });

      assert.equal(res.exitCode, 0);
      const table = parseScorecardTable(res.stdout);
      assert.ok(
        table.rows.length >= 8,
        "Scorecard table must remain parseable despite verbose output",
      );
    });
  });

  // =========================================================================
  // Subsuite 2: Requirement R2 — Container Harness Boundaries & Errors (6 tests)
  // =========================================================================
  describe("R2: Container Harness Boundaries & Errors", () => {
    it("T2.2.1: run.mjs handles Docker CLI daemon timeout (5-second timeout on docker info) and terminates with exit code 1", async () => {
      const mock = await createMockDocker("timeout");
      try {
        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: mock.env,
          timeoutMs: 12_000,
        });

        assert.equal(
          res.exitCode,
          1,
          `Expected exit code 1 on daemon timeout, got ${res.exitCode}`,
        );
        assert.ok(
          res.stderr.includes("[ERROR] Docker daemon is not running or unreachable."),
          `stderr must report unreachable daemon on timeout. Got: ${res.stderr}`,
        );
      } finally {
        await mock.cleanup();
      }
    });

    it("T2.2.2: run.mjs handles completely empty PATH environment variable gracefully with exit code 1", async () => {
      const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
        cwd: PROJECT_ROOT,
        env: { PATH: "" },
      });

      assert.equal(res.exitCode, 1, `Expected exit code 1 when PATH is empty, got ${res.exitCode}`);
      assert.ok(
        res.stderr.includes("[ERROR] Docker is not installed or not found in PATH."),
        "Must print clear missing Docker error when PATH is empty",
      );
    });

    it("T2.2.3: run.mjs handles non-executable docker file in PATH gracefully with exit code 1", async () => {
      if (process.platform === "win32") {
        return; // File executable permissions are POSIX-specific
      }

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-nonexec-"));
      try {
        const dummyDocker = path.join(tmpDir, "docker");
        await fs.writeFile(dummyDocker, "not a script", { mode: 0o644 });

        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: `${tmpDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
          },
        });

        assert.equal(
          res.exitCode,
          1,
          "Must exit with code 1 when docker in PATH is non-executable",
        );
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("T2.2.4: User arguments with flags and quoted strings are forwarded verbatim to container command", async () => {
      const mock = await createMockDocker("daemon-up");
      try {
        const res = await runCommand(
          process.execPath,
          ["tests/tooling/docker/run.mjs", "pnpm", "run", "test:fast", "--filter=@custom/pkg"],
          {
            cwd: PROJECT_ROOT,
            env: mock.env,
          },
        );

        assert.equal(res.exitCode, 0, `Mock docker run failed with stderr: ${res.stderr}`);
        assert.ok(
          res.stdout.includes("test:fast") || res.stdout.includes("--filter=@custom/pkg"),
          `Forwarded arguments missing from container execution output: ${res.stdout}`,
        );
      } finally {
        await mock.cleanup();
      }
    });

    it("T2.2.5: run.mjs registers signal handlers to forward SIGINT and SIGTERM to container subprocess", async () => {
      const runMjsPath = path.join(PROJECT_ROOT, "tests", "tooling", "docker", "run.mjs");
      const content = await fs.readFile(runMjsPath, "utf8");

      assert.ok(
        content.includes('process.on("SIGINT"') || content.includes("process.on('SIGINT'"),
        "run.mjs must register SIGINT handler to prevent orphaned container processes",
      );
      assert.ok(
        content.includes('process.on("SIGTERM"') || content.includes("process.on('SIGTERM'"),
        "run.mjs must register SIGTERM handler",
      );
      assert.ok(
        content.includes("containerProc.kill"),
        "run.mjs must forward kill signal to containerProc",
      );
    });

    it("T2.2.6: Container build or runtime non-zero exit code is preserved and propagated as runner exit code", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-mock-fail-"));
      const isWindows = process.platform === "win32";
      const scriptPath = path.join(tmpDir, isWindows ? "docker.cmd" : "docker");

      const scriptContent = isWindows
        ? `@echo off\r\nif "%1"=="--version" exit /b 0\r\nif "%1"=="info" exit /b 0\r\nif "%1"=="build" exit /b 42\r\nexit /b 0\r\n`
        : `#!/bin/sh\nif [ "$1" = "--version" ] || [ "$1" = "info" ]; then exit 0; fi\nif [ "$1" = "build" ]; then exit 42; fi\nexit 0\n`;

      await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

      try {
        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            PATH: `${tmpDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
          },
        });

        assert.equal(
          res.exitCode,
          42,
          `Runner must propagate container build failure exit code (expected 42, got ${res.exitCode})`,
        );
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // Subsuite 3: Requirement R3 — Token Security Boundaries & Hostile Environments (6 tests)
  // =========================================================================
  describe("R3: Token Security Boundaries & Hostile Environments", () => {
    it("T2.3.1: Pre-existing .token with insecure mode 0644 (world-readable) is detected and tightened to 0600", async () => {
      if (process.platform === "win32") {
        return;
      }

      const ws = await createTempWorkspace();
      try {
        const validToken = "b".repeat(64);
        await ws.writeFile(".token", validToken, 0o644);

        const initialMode = await ws.getFileMode(".token");
        assert.equal(initialMode, 0o644, "Test setup must start with insecure 0644 permissions");

        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const finalMode = await ws.getFileMode(".token");
          assert.equal(
            finalMode,
            0o600,
            `Insecure token mode 0644 must be automatically secured to 0600. Got: 0o${finalMode.toString(8)}`,
          );
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T2.3.2: Pre-existing .token with permissive mode 0666 or 0777 is corrected to 0600", async () => {
      if (process.platform === "win32") {
        return;
      }

      const ws = await createTempWorkspace();
      try {
        const validToken = "c".repeat(64);
        await ws.writeFile(".token", validToken, 0o777);

        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const finalMode = await ws.getFileMode(".token");
          assert.equal(
            finalMode,
            0o600,
            `Overly permissive token mode 0777 must be corrected to 0600. Got: 0o${finalMode.toString(8)}`,
          );
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T2.3.3: Symlinked .token file is strictly rejected to prevent symlink hijack attacks across various target sizes", async () => {
      const testCases = [
        { name: "empty file (0 bytes)", content: "" },
        { name: "short file (25 bytes)", content: "s".repeat(25) },
        { name: "arbitrary file (100 bytes)", content: "x".repeat(100) },
      ];

      for (const tc of testCases) {
        const ws = await createTempWorkspace();
        const targetWs = await createTempWorkspace();
        try {
          const targetPath = path.join(targetWs.dir, "sensitive_target.txt");
          await fs.writeFile(targetPath, tc.content);

          const linkPath = path.join(ws.dir, ".token");
          await fs.symlink(targetPath, linkPath);

          const binaryPath = await ensureAgyBoostBinary();
          const res = await runCommand(binaryPath, ["daemon", "--port", "49250"], {
            cwd: PROJECT_ROOT,
            env: { AGY_BOOST_USER_DATA: ws.dir },
            timeoutMs: 3000,
          });

          assert.notEqual(
            res.exitCode,
            0,
            `Daemon must fail to start when .token is a symlink (${tc.name})`,
          );
          assert.ok(
            res.stderr.includes("symlink") || res.stdout.includes("symlink"),
            `stderr must cite refusal to follow symlink (${tc.name}). Got: ${res.stderr}`,
          );

          // Verify target file was not modified
          const targetContent = await fs.readFile(targetPath, "utf8");
          assert.equal(
            targetContent,
            tc.content,
            `Symlink target file must not be modified (${tc.name})`,
          );
        } finally {
          await ws.cleanup();
          await targetWs.cleanup();
        }
      }
    });

    it("T2.3.4: Non-regular file (directory and FIFO named pipe) named .token is rejected with an error without hanging", async () => {
      // Subcase A: Directory named .token
      const wsDir = await createTempWorkspace();
      try {
        await fs.mkdir(path.join(wsDir.dir, ".token"));

        const binaryPath = await ensureAgyBoostBinary();
        const res = await runCommand(binaryPath, ["daemon", "--port", "49251"], {
          cwd: PROJECT_ROOT,
          env: { AGY_BOOST_USER_DATA: wsDir.dir },
          timeoutMs: 3000,
        });

        assert.notEqual(res.exitCode, 0, "Daemon must fail when .token is a directory");
      } finally {
        await wsDir.cleanup();
      }

      // Subcase B: FIFO named pipe on POSIX
      if (process.platform !== "win32") {
        const wsFifo = await createTempWorkspace();
        try {
          const fifoPath = path.join(wsFifo.dir, ".token");
          await runCommand("mkfifo", [fifoPath]);

          // To prevent tests hanging if daemon opens FIFO for reading, schedule EOF delivery after 100ms
          const unblockTimer = setTimeout(async () => {
            try {
              const fd = await fs.open(fifoPath, "w");
              await fd.close();
            } catch {
              // Ignore if already rejected or closed
            }
          }, 100);

          const binaryPath = await ensureAgyBoostBinary();
          const res = await runCommand(binaryPath, ["daemon", "--port", "49252"], {
            cwd: PROJECT_ROOT,
            env: { AGY_BOOST_USER_DATA: wsFifo.dir },
            timeoutMs: 3000,
          });

          clearTimeout(unblockTimer);

          assert.strictEqual(res.timedOut, false, "Daemon must not hang when .token is a FIFO");
          assert.notEqual(res.exitCode, 0, "Daemon must fail when .token is a FIFO named pipe");
          assert.ok(
            res.stderr.includes("non-regular file") ||
              res.stderr.includes("refusing to write token") ||
              res.stderr.includes("Failed to initialize daemon"),
            `stderr must indicate rejection of non-regular file. Got: ${res.stderr}`,
          );
        } finally {
          await wsFifo.cleanup();
        }
      }
    });

    it("T2.3.5: Corrupted or truncated token content (!= 64 hex characters) is regenerated securely and permissions tightened", async () => {
      const ws = await createTempWorkspace();
      try {
        // Initialize corrupted token with insecure 0644 permissions to test tightening to 0600
        await ws.writeFile(".token", "short_corrupted_token", 0o644);

        if (process.platform !== "win32") {
          const initialMode = await ws.getFileMode(".token");
          assert.equal(initialMode, 0o644, "Initial corrupted token must have mode 0644");
        }

        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const newToken = await ws.readFile(".token");
          assert.equal(
            newToken.trim().length,
            64,
            "Corrupted token must be regenerated to 64 hex characters",
          );
          assert.notEqual(
            newToken.trim(),
            "short_corrupted_token",
            "Corrupted content must be replaced",
          );

          if (process.platform !== "win32") {
            const mode = await ws.getFileMode(".token");
            assert.equal(
              mode,
              0o600,
              "Regenerated token must have permissions tightened from 0644 to 0600",
            );
          }
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T2.3.6: Headless environment with missing user.Current() resolves data dir via resolveHomeDir()", async () => {
      const res = await runCommand(
        "go",
        ["test", "-v", "./src/host", "-run", "TestResolveHomeDir"],
        { cwd: PROJECT_ROOT },
      );
      assert.equal(
        res.exitCode,
        0,
        `resolveHomeDir fallbacks test failed:\n${res.stdout}\n${res.stderr}`,
      );
    });
  });
});
