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
  isReleaseGateSupported,
} from "./helpers/e2e-harness.js";

describe("Tier 3: Cross-Feature Combinations (Opaque-Box)", () => {
  // =========================================================================
  // T3.1 (R1 x R2): Container Harness accepts and forwards release-gate command
  // =========================================================================
  it("T3.1 (R1 x R2): run.mjs accepts and forwards release-gate command into container harness", async () => {
    const mock = await createMockDocker("daemon-up");
    try {
      const res = await runCommand(
        process.execPath,
        ["tests/tooling/docker/run.mjs", "go", "run", "./scripts/build.go", "release-gate"],
        {
          cwd: PROJECT_ROOT,
          env: mock.env,
        },
      );

      assert.equal(res.exitCode, 0, `Expected code 0, got ${res.exitCode}. stderr: ${res.stderr}`);
      assert.ok(
        res.stdout.includes("release-gate"),
        `Forwarded release-gate command must appear in container run log: ${res.stdout}`,
      );
    } finally {
      await mock.cleanup();
    }
  });

  // =========================================================================
  // T3.2 (R1 x R2): Container image satisfies dependencies for all 8 release-gate steps
  // =========================================================================
  it("T3.2 (R1 x R2): Dockerfile.test specifies all toolchains required for the 8 release-gate steps", async () => {
    const dockerfilePath = path.join(PROJECT_ROOT, "tests", "tooling", "docker", "Dockerfile.test");
    const content = await fs.readFile(dockerfilePath, "utf8");

    // format:check & lint:go & typecheck:go & build:all require Go 1.24
    assert.ok(content.includes("golang:1.24"), "Go 1.24 toolchain required for Go pipeline steps");

    // format:check (biome) & typecheck:ts require Node 22 & pnpm
    assert.ok(content.includes("node:22"), "Node 22 runtime required for JS/TS pipeline steps");
    assert.ok(
      content.includes("pnpm@10.27.0"),
      "pnpm 10.27.0 package manager required for workspace scripts",
    );

    // test:e2e requires Headless Chromium
    assert.ok(
      content.includes("chromium"),
      "Chromium binary required for headless browser E2E step",
    );
    assert.ok(
      content.includes("CHROME_BIN=/usr/bin/chromium"),
      "CHROME_BIN must point to container chromium",
    );
  });

  // =========================================================================
  // T3.3 (R1 x R3): release-gate under isolated AGY_BOOST_USER_DATA leaves host clean
  // =========================================================================
  it("T3.3 (R1 x R3): release-gate under AGY_BOOST_USER_DATA completes without modifying host user config", async (t) => {
    if (!(await isReleaseGateSupported())) {
      t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
      return;
    }

    const ws = await createTempWorkspace();
    try {
      const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate"], {
        cwd: PROJECT_ROOT,
        env: { AGY_BOOST_USER_DATA: ws.dir },
        timeoutMs: 120_000,
      });

      assert.equal(
        res.exitCode,
        0,
        `release-gate failed with isolated user data dir: ${res.stderr}`,
      );
    } finally {
      await ws.cleanup();
    }
  });

  // =========================================================================
  // T3.4 (R1 x R3): release-gate runs headlessly with DISPLAY and WAYLAND_DISPLAY unset
  // =========================================================================
  it("T3.4 (R1 x R3): release-gate executes headlessly without GUI display server", async (t) => {
    if (!(await isReleaseGateSupported())) {
      t.skip("Requirement R1 pending Milestone 3 implementation in scripts/build.go");
      return;
    }

    const res = await runCommand("go", ["run", "./scripts/build.go", "release-gate"], {
      cwd: PROJECT_ROOT,
      env: {
        DISPLAY: "",
        WAYLAND_DISPLAY: "",
      },
      timeoutMs: 120_000,
    });

    assert.equal(
      res.exitCode,
      0,
      `release-gate crashed in headless display environment: ${res.stderr}`,
    );
  });

  // =========================================================================
  // T3.5 (R2 x R3): Container environment creates token with 0600 without permissions conflict
  // =========================================================================
  it("T3.5 (R2 x R3): Linux container environment enforces 0600 token mode and XDG compliance", async () => {
    const ws = await createTempWorkspace();
    try {
      const res = await runCommand(
        "go",
        ["test", "-v", "./src/daemon", "-run", "TestTokenPermissions_POSIX"],
        {
          cwd: PROJECT_ROOT,
          env: {
            CI: "true",
            AGY_BOOST_USER_DATA: ws.dir,
          },
        },
      );

      assert.equal(
        res.exitCode,
        0,
        `Token permission tests failed in container environment simulation: ${res.stderr}`,
      );
    } finally {
      await ws.cleanup();
    }
  });

  // =========================================================================
  // T3.6 (R2 x R3): Host token file permissions are not corrupted by container execution
  // =========================================================================
  it("T3.6 (R2 x R3): Volume-mounted token file preserves 0600 mode and prevents world/group leakage during container execution", async () => {
    if (process.platform === "win32") {
      return;
    }

    const mock = await createMockDocker("daemon-up");
    const ws = await createTempWorkspace();
    try {
      await ws.writeFile(".token", "f".repeat(64), 0o600);

      const initialMode = await ws.getFileMode(".token");
      assert.equal(initialMode, 0o600, "Initial mode must be 0600");

      // Invoke container harness forwarding volume mount arguments for the token directory
      const volumeArg = `-v=${ws.dir}:/workspace/data:ro`;
      const res = await runCommand(
        process.execPath,
        ["tests/tooling/docker/run.mjs", volumeArg, "node", "-e", "process.exit(0)"],
        {
          cwd: PROJECT_ROOT,
          env: mock.env,
        },
      );

      assert.equal(res.exitCode, 0, `Container run must succeed: ${res.stderr}`);
      assert.ok(
        res.stdout.includes("[mock-docker] Container executed successfully:") &&
          res.stdout.includes(volumeArg),
        "Docker runner must forward volume mount arguments to container execution",
      );

      // Verify group and other bits remain zeroed out following container execution
      const postMode = await ws.getFileMode(".token");
      assert.equal(postMode, 0o600, "Post-run mode must remain 0600");
      assert.equal(postMode & 0o077, 0, "Group and other permission bits must be 0");
    } finally {
      await mock.cleanup();
      await ws.cleanup();
    }
  });

  // =========================================================================
  // T3.7 (R1 x R2 x R3): Pipeline resilience when Docker daemon is down
  // =========================================================================
  it("T3.7 (R1 x R2 x R3): When Docker daemon is unreachable, container harness fails fast while native scripts operate", async () => {
    const mock = await createMockDocker("daemon-down");
    try {
      // Container harness fails fast with code 1
      const dockerRes = await runCommand(process.execPath, ["tests/tooling/docker/run.mjs"], {
        cwd: PROJECT_ROOT,
        env: mock.env,
      });
      assert.equal(dockerRes.exitCode, 1, "test:docker must exit 1 when daemon unreachable");
      assert.ok(
        dockerRes.stderr.includes("Docker daemon is not running or unreachable"),
        "Must log unreachable daemon",
      );

      // Native scripts/build.go typecheck operates independently of Docker
      const nativeRes = await runCommand("go", ["run", "./scripts/build.go", "typecheck"], {
        cwd: PROJECT_ROOT,
        env: mock.env,
        timeoutMs: 30_000,
      });
      assert.equal(
        nativeRes.exitCode,
        0,
        `Native build script must succeed without Docker: ${nativeRes.stderr}`,
      );
    } finally {
      await mock.cleanup();
    }
  });

  // =========================================================================
  // T3.8 (R1 x R3): Electron patcher runtime bootstrap syncs with daemon XDG token path
  // =========================================================================
  it("T3.8 (R1 x R3): Electron bootstrap template in patcher.go resolves token via XDG and AGY_BOOST_USER_DATA", async () => {
    const patcherPath = path.join(PROJECT_ROOT, "src", "patcher", "patcher.go");
    const content = await fs.readFile(patcherPath, "utf8");

    // Patcher bootstrap template must check AGY_BOOST_USER_DATA and XDG paths
    assert.ok(
      content.includes("AGY_BOOST_USER_DATA"),
      "src/patcher/patcher.go bootstrap script must check AGY_BOOST_USER_DATA",
    );
    assert.ok(
      content.includes("XDG_CONFIG_HOME") || content.includes(".config"),
      "src/patcher/patcher.go bootstrap script must support XDG base directory specification",
    );
    assert.ok(
      content.includes(".token"),
      "src/patcher/patcher.go bootstrap script must read the .token file for daemon authentication",
    );
  });
});
