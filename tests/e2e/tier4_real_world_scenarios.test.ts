import { test as it, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
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

describe("Tier 4: Real-World Developer & CI Application Scenarios (Opaque-Box)", () => {
  // =========================================================================
  // Scenario 1: Clean Release Cut Journey
  // =========================================================================
  it("T4.1: Clean Release Cut Journey — Full pipeline gate to multi-platform distribution", async (t) => {
    if (!(await isReleaseGateSupported())) {
      t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
      return;
    }

    const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate"], {
      cwd: PROJECT_ROOT,
      timeoutMs: 180_000,
    });

    assert.equal(res.exitCode, 0, `Clean release cut pipeline failed: ${res.stderr}`);

    // Verify scorecard table
    const table = parseScorecardTable(res.stdout);
    assert.ok(table.rows.length >= 8, "Expected 8 pipeline steps in release scorecard");
    for (const row of table.rows) {
      assert.equal(
        row.status.toUpperCase(),
        "PASSED",
        `Step ${row.name} must pass during clean release cut`,
      );
    }

    // Verify binary distribution artifacts generated in dist/
    const hostBin = path.join(
      PROJECT_ROOT,
      "dist",
      process.platform === "win32" ? "agy-boost.exe" : "agy-boost",
    );
    const exists = await fs
      .access(hostBin)
      .then(() => true)
      .catch(() => false);
    assert.ok(exists, `Host binary ${hostBin} must exist after clean release cut`);
  });

  // =========================================================================
  // Scenario 2: Pre-Commit Invariant Violation & Fast Remediation
  // =========================================================================
  it("T4.2: Pre-Commit Invariant Violation & Fast Remediation Workflow", async () => {
    const ws = await createTempWorkspace();
    try {
      // Step A: Developer introduces an unformatted Go file in the workspace
      const malformedGo = "package main\n\nfunc Unformatted(  a int,b string ) {\n}\n";
      const badFilePath = path.join(ws.dir, "bad.go");
      await fs.writeFile(badFilePath, malformedGo);

      const buildScriptPath = path.join(PROJECT_ROOT, "scripts", "build.go");

      // Step B: Format check fails fast against the workspace containing bad.go
      const failRes = await runCommand("go", ["run", buildScriptPath, "format", "--check"], {
        cwd: ws.dir,
        timeoutMs: 30_000,
      });

      assert.notEqual(failRes.exitCode, 0, "Pipeline must abort when unformatted file is present");
      assert.ok(
        failRes.stderr.includes("bad.go") || failRes.stdout.includes("bad.go"),
        "Failure output must identify bad.go as unformatted",
      );

      // Step C: Developer applies remediation (runs gofmt / formatting)
      await runCommand("gofmt", ["-w", "-s", badFilePath]);

      // Step D: Developer reruns format check against the exact same workspace, verifying clean pass
      const passRes = await runCommand("go", ["run", buildScriptPath, "format", "--check"], {
        cwd: ws.dir,
        timeoutMs: 30_000,
      });
      assert.equal(
        passRes.exitCode,
        0,
        "Format check must pass following remediation in workspace",
      );
    } finally {
      await ws.cleanup();
    }
  });

  // =========================================================================
  // Scenario 3: Local Pre-CI Validation Without Docker Daemon
  // =========================================================================
  it("T4.3: Local Pre-CI Validation Without Docker Daemon — Fast feedback & native fallback", async () => {
    // Phase A: Developer on a laptop without Docker runs test:docker
    const mock = await createMockDocker("daemon-down");
    try {
      const dockerRes = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
        cwd: PROJECT_ROOT,
        env: mock.env,
      });

      assert.equal(dockerRes.exitCode, 1, "test:docker must fail-fast when Docker is unavailable");
      assert.ok(
        dockerRes.stderr.includes("[ERROR] Docker daemon is not running or unreachable."),
        "Error message must clearly inform developer that Docker daemon is not running",
      );
      assert.ok(
        dockerRes.stderr.includes("Please ensure Docker Desktop"),
        "Must offer actionable remediation advice to start Docker Desktop",
      );

      // Phase B: Developer immediately runs native fast-gate alternative without Docker
      const nativeFastRes = await runCommand(
        "go",
        ["run", "./scripts/build.go", "format", "--check"],
        {
          cwd: PROJECT_ROOT,
          env: mock.env,
        },
      );
      assert.equal(
        nativeFastRes.exitCode,
        0,
        "Native toolchain checks must pass without Docker dependency",
      );

      const typecheckRes = await runCommand("go", ["run", "./scripts/build.go", "typecheck"], {
        cwd: PROJECT_ROOT,
        env: mock.env,
      });
      assert.equal(typecheckRes.exitCode, 0, "Native typecheck must succeed without Docker");
    } finally {
      await mock.cleanup();
    }
  });

  // =========================================================================
  // Scenario 4: Headless Server / Containerized CI Deployment
  // =========================================================================
  it("T4.4: Headless Server / Containerized CI Deployment — Daemon startup, token creation & HTTP auth", async () => {
    const ws = await createTempWorkspace();
    try {
      const xdgDir = path.join(ws.dir, "xdg_config");
      let appDataDir: string;
      const env: NodeJS.ProcessEnv = {
        DISPLAY: "",
        WAYLAND_DISPLAY: "",
      };

      if (process.platform === "linux") {
        appDataDir = path.join(xdgDir, "AGYBoost");
        await fs.mkdir(xdgDir, { recursive: true });
        env["XDG_CONFIG_HOME"] = xdgDir;
      } else if (process.platform === "darwin") {
        env["HOME"] = ws.dir;
        appDataDir = path.join(ws.dir, "Library", "Application Support", "AGYBoost");
        await fs.mkdir(appDataDir, { recursive: true });
        env["XDG_CONFIG_HOME"] = xdgDir;
      } else {
        const appData = path.join(ws.dir, "AppData", "Roaming");
        env["APPDATA"] = appData;
        appDataDir = path.join(appData, "AGYBoost");
        await fs.mkdir(appDataDir, { recursive: true });
      }

      // Run headlessly with DISPLAY & WAYLAND_DISPLAY unset, relying on standard OS / XDG path resolution.
      // Notice userDataDir is omitted so AGY_BOOST_USER_DATA is not forced in spawnDaemon.
      const d = await spawnDaemon({
        env,
      });

      try {
        // Assert token created in XDG / OS app data directory with strict permissions
        const tokenFile = path.join(appDataDir, ".token");
        const exists = await fs
          .access(tokenFile)
          .then(() => true)
          .catch(() => false);
        assert.ok(exists, `Expected .token in resolved app data directory ${appDataDir}`);

        if (process.platform !== "win32") {
          const stat = await fs.lstat(tokenFile);
          assert.equal(
            stat.mode & 0o777,
            0o600,
            "Token file must have mode 0600 in headless server",
          );
        }

        const tokenContent = (await fs.readFile(tokenFile, "utf8")).trim();
        assert.equal(tokenContent.length, 64, "Generated token must be 64-character hex");

        // Test unauthenticated request to /health -> 200 OK
        const healthStatus = await new Promise<number>((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${d.port}/health`, (res) => {
            resolve(res.statusCode ?? 0);
          });
          req.on("error", reject);
        });
        assert.equal(healthStatus, 200, "Health endpoint must respond 200 OK");

        // Test unauthenticated request to protected endpoint /diagnostics -> 401 Unauthorized
        const unauthStatus = await new Promise<number>((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${d.port}/diagnostics`, (res) => {
            resolve(res.statusCode ?? 0);
          });
          req.on("error", reject);
        });
        assert.equal(
          unauthStatus,
          401,
          "Protected diagnostics route must reject requests without token",
        );

        // Test authenticated request with X-AGY-Token -> 200 OK
        const authStatus = await new Promise<number>((resolve, reject) => {
          const req = http.get(
            `http://127.0.0.1:${d.port}/diagnostics`,
            { headers: { "X-AGY-Token": tokenContent } },
            (res) => {
              resolve(res.statusCode ?? 0);
            },
          );
          req.on("error", reject);
        });
        assert.equal(
          authStatus,
          200,
          "Protected route must accept request with valid X-AGY-Token header",
        );
      } finally {
        await d.kill();
      }
    } finally {
      await ws.cleanup();
    }
  });

  // =========================================================================
  // Scenario 5: Hostile Environment & Insecure Token Recovery
  // =========================================================================
  it("T4.5: Hostile Environment & Insecure Token Recovery — Permission self-healing and symlink defense", async () => {
    // Stage 1: Insecure permissions self-healing
    const ws1 = await createTempWorkspace();
    try {
      const validToken = "d".repeat(64);
      await ws1.writeFile(".token", validToken, 0o777);

      const d = await spawnDaemon({ userDataDir: ws1.dir });
      try {
        if (process.platform !== "win32") {
          const mode = await ws1.getFileMode(".token");
          assert.equal(
            mode,
            0o600,
            "World-writable token must be hardened to 0600 on daemon initialization",
          );
        }
      } finally {
        await d.kill();
      }
    } finally {
      await ws1.cleanup();
    }

    // Stage 2: Symlink hijack refusal
    const ws2 = await createTempWorkspace();
    const sensitiveWs = await createTempWorkspace();
    try {
      const sensitiveFile = path.join(sensitiveWs.dir, "passwd.mock");
      const sensitivePayload = "root:x:0:0:root:/root:/bin/bash\n";
      await fs.writeFile(sensitiveFile, sensitivePayload);

      // Create symlink from .token pointing to sensitive target
      const tokenSymlink = path.join(ws2.dir, ".token");
      await fs.symlink(sensitiveFile, tokenSymlink);

      const binaryPath = await ensureAgyBoostBinary();

      const res = await runCommand(binaryPath, ["daemon", "--port", "49300"], {
        cwd: PROJECT_ROOT,
        env: { AGY_BOOST_USER_DATA: ws2.dir },
        timeoutMs: 3000,
      });

      assert.notEqual(res.exitCode, 0, "Daemon must reject starting with symlinked token file");
      assert.ok(
        res.stderr.includes("symlink") || res.stdout.includes("symlink"),
        "Must cite symlink violation in daemon log",
      );

      // Verify that the sensitive target file was preserved without modification
      const preservedContent = await fs.readFile(sensitiveFile, "utf8");
      assert.equal(
        preservedContent,
        sensitivePayload,
        "Sensitive file target must not be overwritten or modified",
      );
    } finally {
      await ws2.cleanup();
      await sensitiveWs.cleanup();
    }
  });
});
