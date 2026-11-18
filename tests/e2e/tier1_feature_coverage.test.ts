import { test as it, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
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
} from "./helpers/e2e-harness.js";

describe("Tier 1: Feature Coverage (Opaque-Box)", () => {
  // =========================================================================
  // Subsuite 1: Requirement R1 — Release Gate Command & Scorecard (6 tests)
  // =========================================================================
  describe("R1: Release Gate Command & Scorecard", () => {
    it("T1.1.1: scripts/build.go release-gate executes successfully with exit code 0", async (t) => {
      if (!(await isReleaseGateSupported())) {
        t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
        return;
      }

      const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate"], {
        cwd: PROJECT_ROOT,
        timeoutMs: 120_000,
      });

      assert.equal(res.exitCode, 0, `release-gate failed with stderr:\n${res.stderr}`);
    });

    it("T1.1.2: scripts/build.go release-gate runs all 8 pipeline steps in monotonic sequential order", async (t) => {
      if (!(await isReleaseGateSupported())) {
        t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
        return;
      }

      const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate"], {
        cwd: PROJECT_ROOT,
        timeoutMs: 120_000,
      });

      assert.equal(res.exitCode, 0);

      const expectedOrder = [
        "format:check",
        "lint",
        "typecheck",
        "test:fast",
        "test:stress",
        "test:integration",
        "test:e2e",
        "build:all",
      ];

      let lastIndex = -1;
      for (const stepName of expectedOrder) {
        const stepIndex = res.stdout.indexOf(stepName);
        assert.ok(stepIndex !== -1, `Step ${stepName} missing from output`);
        assert.ok(
          stepIndex > lastIndex,
          `Step ${stepName} executed out of order (pos ${stepIndex} <= lastPos ${lastIndex})`,
        );
        lastIndex = stepIndex;
      }
    });

    it("T1.1.3: scripts/build.go release-gate outputs formatted ASCII scorecard table with headers", async (t) => {
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
        `Expected at least 8 scorecard rows, got ${table.rows.length}`,
      );

      const hasTableHeaders =
        /Scorecard|Release Gate/i.test(res.stdout) &&
        /(?:Step|#)/i.test(res.stdout) &&
        /(?:Status)/i.test(res.stdout) &&
        /(?:Duration|Time)/i.test(res.stdout);
      assert.ok(hasTableHeaders, "Scorecard table header markers missing from stdout");
    });

    it("T1.1.4: Scorecard displays status PASSED for every step on a clean repository", async (t) => {
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
      for (const row of table.rows) {
        assert.equal(
          row.status.toUpperCase(),
          "PASSED",
          `Step ${row.step} (${row.name}) expected status PASSED, got ${row.status}`,
        );
      }
    });

    it("T1.1.5: Scorecard reports individual step execution duration with valid numeric time units", async (t) => {
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
      for (const row of table.rows) {
        assert.ok(row.durationSec >= 0, `Duration for ${row.name} must be non-negative`);
        assert.match(
          row.durationRaw,
          /^\d+(\.\d+)?(s|ms)$/,
          `Duration raw format '${row.durationRaw}' for ${row.name} must end in s or ms`,
        );
      }
    });

    it("T1.1.6: package.json registers release-gate script alias resolving to build.go", async (t) => {
      const pkgPath = path.join(PROJECT_ROOT, "package.json");
      const pkgRaw = await fs.readFile(pkgPath, "utf8");
      const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };

      if (!pkg.scripts?.["release-gate"]) {
        if (!(await isReleaseGateSupported())) {
          t.skip(
            "Requirement R1 pending Milestone 3 implementation of release-gate in package.json",
          );
          return;
        }
      }

      assert.ok(pkg.scripts?.["release-gate"], "package.json missing 'release-gate' script alias");
      assert.match(
        pkg.scripts["release-gate"],
        /build\.go\s+release-gate/,
        "package.json 'release-gate' script must invoke scripts/build.go release-gate",
      );
    });
  });

  // =========================================================================
  // Subsuite 2: Requirement R2 — Container Harness & Daemon Check (6 tests)
  // =========================================================================
  describe("R2: Container Harness & Docker Daemon Check", () => {
    it("T1.2.1: Dockerfile.test exists and defines minimal throwaway Linux matrix", async () => {
      const dockerfilePath = path.join(
        PROJECT_ROOT,
        "tests",
        "tooling",
        "docker",
        "Dockerfile.test",
      );
      const exists = await fs
        .access(dockerfilePath)
        .then(() => true)
        .catch(() => false);
      assert.ok(exists, "tests/tooling/docker/Dockerfile.test must exist");

      const content = await fs.readFile(dockerfilePath, "utf8");
      assert.ok(content.includes("golang:1.24"), "Must use Go 1.24 base image");
      assert.ok(content.includes("node:22-bookworm-slim"), "Must use Node 22 slim Debian runtime");
      assert.ok(content.includes("chromium"), "Must install headless chromium for UI tests");
      assert.ok(content.includes("pnpm@10.27.0"), "Must enable pnpm@10.27.0");
      assert.ok(
        content.includes('CMD ["pnpm", "run", "test:all"]'),
        "Default CMD must run test:all",
      );
    });

    it("T1.2.2: .dockerignore exists in root and excludes local artifacts and metadata", async () => {
      const ignorePath = path.join(PROJECT_ROOT, ".dockerignore");
      const exists = await fs
        .access(ignorePath)
        .then(() => true)
        .catch(() => false);
      assert.ok(exists, "Root .dockerignore must exist");

      const content = await fs.readFile(ignorePath, "utf8");
      const requiredExclusions = ["node_modules", "dist", ".git", ".agents"];
      for (const excl of requiredExclusions) {
        assert.ok(
          content.includes(excl),
          `.dockerignore must exclude '${excl}' to prevent context bloat and state pollution`,
        );
      }
    });

    it("T1.2.3: tests/tooling/docker/run.mjs exits with code 1 when Docker binary is missing", async () => {
      const mock = await createMockDocker("missing");
      try {
        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: mock.env,
        });

        assert.equal(
          res.exitCode,
          1,
          `Expected exit code 1 when Docker missing, got ${res.exitCode}`,
        );
      } finally {
        await mock.cleanup();
      }
    });

    it("T1.2.4: tests/tooling/docker/run.mjs prints explicit error message when Docker binary is missing", async () => {
      const mock = await createMockDocker("missing");
      try {
        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: mock.env,
        });

        assert.ok(
          res.stderr.includes("[ERROR] Docker is not installed or not found in PATH."),
          `stderr must contain explicit missing Docker error message. Got: ${res.stderr}`,
        );
        assert.ok(
          res.stderr.includes("Requirement R2:"),
          "stderr must reference Requirement R2 in error details",
        );
      } finally {
        await mock.cleanup();
      }
    });

    it("T1.2.5: tests/tooling/docker/run.mjs exits with code 1 and logs unreachable daemon when Docker daemon is down", async () => {
      const mock = await createMockDocker("daemon-down");
      try {
        const res = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
          cwd: PROJECT_ROOT,
          env: mock.env,
        });

        assert.equal(
          res.exitCode,
          1,
          `Expected exit code 1 when daemon is down, got ${res.exitCode}`,
        );
        assert.ok(
          res.stderr.includes("[ERROR] Docker daemon is not running or unreachable."),
          `stderr must log daemon unreachable error. Got: ${res.stderr}`,
        );
      } finally {
        await mock.cleanup();
      }
    });

    it("T1.2.6: package.json registers test:docker script alias", async () => {
      const pkgPath = path.join(PROJECT_ROOT, "package.json");
      const pkgRaw = await fs.readFile(pkgPath, "utf8");
      const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };

      assert.ok(pkg.scripts?.["test:docker"], "package.json missing 'test:docker' script alias");
      assert.match(
        pkg.scripts["test:docker"],
        /run\.mjs/,
        "package.json 'test:docker' must invoke tests/tooling/docker/run.mjs",
      );
    });
  });

  // =========================================================================
  // Subsuite 3: Requirement R3 — Token Permissions & Headless XDG (6 tests)
  // =========================================================================
  describe("R3: Token Permissions & Headless XDG Fallback", () => {
    it("T1.3.1: Daemon initializes and creates .token file with strict 0600 mode on POSIX", async () => {
      if (process.platform === "win32") {
        return; // POSIX-specific mode test
      }

      const ws = await createTempWorkspace();
      try {
        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const exists = await ws.exists(".token");
          assert.ok(exists, `Expected .token to be created in ${ws.dir}`);

          const mode = await ws.getFileMode(".token");
          assert.equal(
            mode,
            0o600,
            `Expected token mode 0600 (-rw-------), got 0o${mode.toString(8)}`,
          );

          const tokenContent = await ws.readFile(".token");
          assert.equal(tokenContent.trim().length, 64, "Token must be a 64-character hex string");
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T1.3.2: Pre-existing valid .token with 0600 permissions is preserved without modification", async () => {
      const ws = await createTempWorkspace();
      try {
        const initialToken = "a".repeat(64);
        await ws.writeFile(".token", initialToken, 0o600);

        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const tokenContent = await ws.readFile(".token");
          assert.equal(
            tokenContent.trim(),
            initialToken,
            "Pre-existing valid token must be preserved",
          );

          if (process.platform !== "win32") {
            const mode = await ws.getFileMode(".token");
            assert.equal(mode, 0o600, "Token mode must remain 0600");
          }
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T1.3.3: UserDataDir() respects AGY_BOOST_USER_DATA override as top priority", async () => {
      const res = await runCommand(
        "go",
        ["test", "-v", "./src/host", "-run", "TestUserDataDir_Precedence"],
        { cwd: PROJECT_ROOT },
      );
      assert.equal(res.exitCode, 0, `Precedence test failed:\n${res.stdout}\n${res.stderr}`);
    });

    it("T1.3.4: UserDataDir() on Linux resolves to $XDG_CONFIG_HOME/AGYBoost when set", async () => {
      const res = await runCommand(
        "go",
        ["test", "-v", "./src/host", "-run", "TestUserDataDir_LinuxXDG"],
        { cwd: PROJECT_ROOT },
      );
      assert.equal(res.exitCode, 0, `Linux XDG test failed:\n${res.stdout}\n${res.stderr}`);
    });

    it("T1.3.5: UserDataDir() on Linux falls back to $HOME/.config/AGYBoost when XDG unset", async () => {
      const res = await runCommand(
        "go",
        ["test", "-v", "./src/host", "-run", "TestUserDataDir_LinuxDefaultFallback"],
        { cwd: PROJECT_ROOT },
      );
      assert.equal(
        res.exitCode,
        0,
        `Linux default fallback test failed:\n${res.stdout}\n${res.stderr}`,
      );
    });

    it("T1.3.6: Windows token security invokes icacls with /inheritance:r and grant (R,W)", async () => {
      const res = await runCommand(
        "go",
        ["test", "-v", "./src/daemon", "-run", "TestWindowsIcacls"],
        { cwd: PROJECT_ROOT },
      );
      assert.equal(
        res.exitCode,
        0,
        `Windows icacls unit validation failed:\n${res.stdout}\n${res.stderr}`,
      );
    });
  });
});
