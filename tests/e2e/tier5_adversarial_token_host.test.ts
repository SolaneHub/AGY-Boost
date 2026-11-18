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
  spawnDaemon,
  ensureAgyBoostBinary,
} from "./helpers/e2e-harness.js";

describe("Tier 5: Token Security & Host Environment Adversarial Hardening (Opaque-Box)", () => {
  // =========================================================================
  // Subsuite 1: Non-Regular File Denial of Service & Hijack Resistance
  // =========================================================================
  describe("R3.1: Non-Regular File Denial of Service & Hijack Resistance", () => {
    it("T5.1.1: FIFO named pipe placed at .token does not deadlock daemon startup", async () => {
      if (process.platform === "win32") return;

      const ws = await createTempWorkspace();
      try {
        const fifoPath = path.join(ws.dir, ".token");
        await runCommand("mkfifo", [fifoPath]);

        // Unblock timer to guarantee test process safety in case of deadlock
        const unblockTimer = setTimeout(async () => {
          try {
            const fd = await fs.open(fifoPath, "w");
            await fd.close();
          } catch {
            // ignore
          }
        }, 800);
        unblockTimer.unref();

        const binaryPath = await ensureAgyBoostBinary();
        const res = await runCommand(binaryPath, ["daemon", "--port", "49301"], {
          cwd: PROJECT_ROOT,
          env: { AGY_BOOST_USER_DATA: ws.dir },
          timeoutMs: 2500,
        });

        clearTimeout(unblockTimer);

        assert.strictEqual(res.timedOut, false, "Daemon must not hang when .token is a FIFO");
        assert.notEqual(
          res.exitCode,
          0,
          "Daemon must fail to start when .token is a FIFO named pipe",
        );
        assert.ok(
          res.stderr.includes("not a regular file") ||
            res.stderr.includes("non-regular file") ||
            res.stderr.includes("refusing to write token") ||
            res.stderr.includes("Failed to initialize daemon") ||
            res.stderr.includes("token file"),
          `stderr must report non-regular file or initialization refusal. Got: ${res.stderr}`,
        );
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.1.2: Directory named .token is rejected and nested canary files remain intact", async () => {
      const ws = await createTempWorkspace();
      try {
        const tokenDirPath = path.join(ws.dir, ".token");
        await fs.mkdir(tokenDirPath);
        const canaryPath = path.join(tokenDirPath, "canary.txt");
        const canaryContent = "CANARY_DATA_DO_NOT_DELETE";
        await fs.writeFile(canaryPath, canaryContent);

        const binaryPath = await ensureAgyBoostBinary();
        const res = await runCommand(binaryPath, ["daemon", "--port", "49302"], {
          cwd: PROJECT_ROOT,
          env: { AGY_BOOST_USER_DATA: ws.dir },
          timeoutMs: 3000,
        });

        assert.notEqual(res.exitCode, 0, "Daemon must fail to start when .token is a directory");
        assert.equal(
          await fs.readFile(canaryPath, "utf8"),
          canaryContent,
          "Canary file inside directory must remain uncorrupted",
        );
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.1.3: Symlink pointing to sensitive system file is rejected without modifying target", async () => {
      if (process.platform === "win32") return;

      const ws = await createTempWorkspace();
      const targetWs = await createTempWorkspace();
      try {
        const sensitiveTarget = path.join(targetWs.dir, "sensitive_shadow.txt");
        const secretContent = "root:x:0:0:root:/root:/bin/bash";
        await fs.writeFile(sensitiveTarget, secretContent, { mode: 0o644 });

        const tokenLink = path.join(ws.dir, ".token");
        await fs.symlink(sensitiveTarget, tokenLink);

        const binaryPath = await ensureAgyBoostBinary();
        const res = await runCommand(binaryPath, ["daemon", "--port", "49303"], {
          cwd: PROJECT_ROOT,
          env: { AGY_BOOST_USER_DATA: ws.dir },
          timeoutMs: 3000,
        });

        assert.notEqual(res.exitCode, 0, "Daemon must fail on symlinked .token");
        assert.ok(
          res.stderr.includes("symlink") || res.stdout.includes("symlink"),
          `stderr must cite symlink rejection. Got: ${res.stderr}`,
        );
        assert.equal(
          await fs.readFile(sensitiveTarget, "utf8"),
          secretContent,
          "Target file content must not be modified",
        );
      } finally {
        await ws.cleanup();
        await targetWs.cleanup();
      }
    });

    it("T5.1.4: Dangling symlink is strictly rejected without creating phantom target", async () => {
      if (process.platform === "win32") return;

      const ws = await createTempWorkspace();
      try {
        const phantomPath = path.join(ws.dir, "phantom_target.txt");
        const tokenLink = path.join(ws.dir, ".token");
        await fs.symlink(phantomPath, tokenLink);

        const binaryPath = await ensureAgyBoostBinary();
        const res = await runCommand(binaryPath, ["daemon", "--port", "49304"], {
          cwd: PROJECT_ROOT,
          env: { AGY_BOOST_USER_DATA: ws.dir },
          timeoutMs: 3000,
        });

        assert.notEqual(res.exitCode, 0, "Daemon must reject dangling symlink");
        assert.equal(
          await ws.exists("phantom_target.txt"),
          false,
          "Phantom target must not be created",
        );
      } finally {
        await ws.cleanup();
      }
    });
  });

  // =========================================================================
  // Subsuite 2: Token Tampering, Boundary & Non-Hex Corruption Self-Healing
  // =========================================================================
  describe("R3.2: Token Tampering, Boundary & Non-Hex Corruption Self-Healing", () => {
    it("T5.2.1: Boundary lengths (0, 1, 63, 65, 1024 bytes) trigger automatic regeneration and 0600 mode", async () => {
      const lengths = [0, 1, 63, 65, 1024];
      for (const len of lengths) {
        const ws = await createTempWorkspace();
        try {
          const dummy = "a".repeat(len);
          await ws.writeFile(".token", dummy, 0o644);

          const d = await spawnDaemon({ userDataDir: ws.dir });
          try {
            const diskToken = (await ws.readFile(".token")).trim();
            assert.equal(
              diskToken.length,
              64,
              `Token must be regenerated to 64 chars for initial length ${len}`,
            );
            assert.match(
              diskToken,
              /^[0-9a-f]{64}$/,
              `Regenerated token must be lowercase hex for initial length ${len}`,
            );

            if (process.platform !== "win32") {
              const mode = await ws.getFileMode(".token");
              assert.equal(
                mode,
                0o600,
                `Mode must be tightened to 0600 from 0644 for initial length ${len}`,
              );
            }
          } finally {
            await d.kill();
          }
        } finally {
          await ws.cleanup();
        }
      }
    });

    it("T5.2.2: Overly permissive mode 0777 on valid token preserves secret while tightening to 0600", async () => {
      if (process.platform === "win32") return;

      const ws = await createTempWorkspace();
      try {
        const validToken = "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";
        await ws.writeFile(".token", validToken, 0o777);

        assert.equal(await ws.getFileMode(".token"), 0o777);

        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const diskToken = (await ws.readFile(".token")).trim();
          assert.equal(diskToken, validToken, "Valid token must be preserved during self-healing");
          const mode = await ws.getFileMode(".token");
          assert.equal(mode, 0o600, "Insecure 0777 mode must be tightened to 0600");
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.3: Read-only mode 0400 on valid token is tightened to 0600 while preserving secret", async () => {
      if (process.platform === "win32") return;

      const ws = await createTempWorkspace();
      try {
        const validToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        await ws.writeFile(".token", validToken, 0o400);

        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const diskToken = (await ws.readFile(".token")).trim();
          assert.equal(diskToken, validToken, "Valid token must be preserved");
          const mode = await ws.getFileMode(".token");
          assert.equal(mode, 0o600, "Mode 0400 must be adjusted to 0600 for self-healing");
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.4: Tampered non-hex 64-character token triggers automatic regeneration and 0600 mode", async () => {
      const ws = await createTempWorkspace();
      try {
        const tamperedNonHex = "z".repeat(64);
        await ws.writeFile(".token", tamperedNonHex, 0o600);

        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const diskToken = (await ws.readFile(".token")).trim();
          assert.notEqual(diskToken, tamperedNonHex, "Tampered non-hex token must be regenerated");
          assert.equal(diskToken.length, 64, "Regenerated token must be 64 characters");
          assert.match(
            diskToken,
            /^[0-9a-f]{64}$/,
            "Regenerated token must be valid lowercase hex",
          );

          if (process.platform !== "win32") {
            const mode = await ws.getFileMode(".token");
            assert.equal(mode, 0o600, "Regenerated token must have 0600 mode");
          }
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.2.5: Multi-instance daemon startup on pre-existing token preserves token secret across instances", async () => {
      const ws = await createTempWorkspace();
      try {
        const initialToken = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
        await ws.writeFile(".token", initialToken, 0o600);

        const d1 = await spawnDaemon({ userDataDir: ws.dir, port: 49401 });
        const d2 = await spawnDaemon({ userDataDir: ws.dir, port: 49402 });
        try {
          const tokenOnDisk = (await ws.readFile(".token")).trim();
          assert.equal(tokenOnDisk, initialToken, "Token on disk must match pre-existing token");

          // Both instances authenticate with the same token
          for (const daemon of [d1, d2]) {
            const res = await new Promise<{ statusCode: number | undefined }>((resolve) => {
              const r = http.request(
                `http://127.0.0.1:${daemon.port}/diagnostics`,
                {
                  agent: false,
                  headers: { "X-AGY-Token": initialToken },
                },
                (resp) => {
                  resp.resume();
                  resp.on("end", () => resolve({ statusCode: resp.statusCode }));
                },
              );
              r.end();
            });
            assert.equal(
              res.statusCode,
              200,
              `Daemon on port ${daemon.port} must accept pre-existing token`,
            );
          }
        } finally {
          await d1.kill();
          await d2.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });
  });

  // =========================================================================
  // Subsuite 3: Constant-Time Verification & Auth Hardening
  // =========================================================================
  describe("R3.3: Constant-Time Verification & Auth Hardening", () => {
    it("T5.3.1: Token mismatches at index 0, middle, end, and length discrepancies all yield 401 Unauthorized", async () => {
      const ws = await createTempWorkspace();
      try {
        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const validToken = (await ws.readFile(".token")).trim();

          const makeTampered = (pos: number) => {
            const arr = validToken.split("");
            arr[pos] = arr[pos] === "0" ? "1" : "0";
            return arr.join("");
          };

          const attackTokens = [
            { name: "index 0 mismatch", token: makeTampered(0) },
            { name: "middle index 31 mismatch", token: makeTampered(31) },
            { name: "last index 63 mismatch", token: makeTampered(63) },
            { name: "truncated 63 chars", token: validToken.slice(0, 63) },
            { name: "overflow 65 chars", token: `${validToken}f` },
            { name: "empty token", token: "" },
            { name: "unrelated token", token: "0".repeat(64) },
          ];

          for (const tc of attackTokens) {
            const req = await new Promise<{ statusCode: number | undefined; body: string }>(
              (resolve) => {
                const r = http.request(
                  `http://127.0.0.1:${d.port}/diagnostics`,
                  {
                    agent: false,
                    headers: { "X-AGY-Token": tc.token },
                  },
                  (res) => {
                    let body = "";
                    res.on("data", (c) => {
                      body += c;
                    });
                    res.on("end", () => resolve({ statusCode: res.statusCode, body }));
                  },
                );
                r.on("error", () => resolve({ statusCode: 500, body: "" }));
                r.end();
              },
            );

            assert.equal(
              req.statusCode,
              401,
              `Attack token ${tc.name} must be rejected with 401 Unauthorized`,
            );
          }

          // Verify valid token returns 200 OK
          const validReq = await new Promise<{ statusCode: number | undefined; body: string }>(
            (resolve) => {
              const r = http.request(
                `http://127.0.0.1:${d.port}/diagnostics`,
                {
                  agent: false,
                  headers: { "X-AGY-Token": validToken },
                },
                (res) => {
                  let body = "";
                  res.on("data", (c) => {
                    body += c;
                  });
                  res.on("end", () => resolve({ statusCode: res.statusCode, body }));
                },
              );
              r.end();
            },
          );
          assert.equal(validReq.statusCode, 200, "Valid token must return 200 OK");
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.3.2: Hostile Cross-Origin & DNS Rebinding headers are rejected with 403 Forbidden", async () => {
      const ws = await createTempWorkspace();
      try {
        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const hostileOrigins = [
            "http://evil.com",
            "http://localhost.attacker.com",
            "http://127.0.0.1.malicious.net",
            "https://phishing.site",
            "http://192.168.1.100:8080",
          ];

          for (const origin of hostileOrigins) {
            const req = await new Promise<{ statusCode: number | undefined }>((resolve) => {
              const r = http.request(
                `http://127.0.0.1:${d.port}/health`,
                {
                  agent: false,
                  headers: { Origin: origin },
                },
                (res) => {
                  res.resume();
                  res.on("end", () => resolve({ statusCode: res.statusCode }));
                },
              );
              r.end();
            });
            assert.equal(
              req.statusCode,
              403,
              `Hostile origin ${origin} must receive 403 Forbidden`,
            );
          }
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });
  });

  // =========================================================================
  // Subsuite 4: Host UserDataDir Priority & Headless Resiliency
  // =========================================================================
  describe("R3.4: Host UserDataDir Priority & Headless Resiliency", () => {
    it("T5.4.1: AGY_BOOST_USER_DATA with special path characters is respected and used by daemon", async () => {
      const ws = await createTempWorkspace("agy special dir #!@ ");
      try {
        const d = await spawnDaemon({ userDataDir: ws.dir });
        try {
          const req = await new Promise<{ status: string; modsDir: string }>((resolve) => {
            const r = http.request(`http://127.0.0.1:${d.port}/health`, { agent: false }, (res) => {
              let body = "";
              res.on("data", (c) => {
                body += c;
              });
              res.on("end", () => resolve(JSON.parse(body)));
            });
            r.end();
          });

          assert.equal(req.status, "ok");
          assert.equal(req.modsDir, path.join(ws.dir, "mods"));
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.4.2: Stripped headless environment with DISPLAY, WAYLAND_DISPLAY, DBUS unset runs without error", async () => {
      const ws = await createTempWorkspace();
      try {
        const d = await spawnDaemon({
          userDataDir: ws.dir,
          env: {
            DISPLAY: "",
            WAYLAND_DISPLAY: "",
            XAUTHORITY: "",
            DBUS_SESSION_BUS_ADDRESS: "",
          },
        });
        try {
          const req = await new Promise<{
            statusCode: number | undefined;
            data: { status: string };
          }>((resolve) => {
            const r = http.request(`http://127.0.0.1:${d.port}/health`, { agent: false }, (res) => {
              let body = "";
              res.on("data", (c) => {
                body += c;
              });
              res.on("end", () => resolve({ statusCode: res.statusCode, data: JSON.parse(body) }));
            });
            r.end();
          });

          assert.equal(req.statusCode, 200);
          assert.equal(req.data.status, "ok");
        } finally {
          await d.kill();
        }
      } finally {
        await ws.cleanup();
      }
    });

    it("T5.4.3: Windows icacls unit test suite and fallback checks pass with 100% assertions", async () => {
      const res = await runCommand(
        "go",
        ["test", "-v", "./src/daemon", "-run", "TestWindowsIcacls_RunnerAndUsernameFallback"],
        { cwd: PROJECT_ROOT },
      );
      assert.equal(res.exitCode, 0, `Windows icacls tests failed:\n${res.stderr}`);
      assert.ok(res.stdout.includes("IcaclsLockdownCommandArgs"));
      assert.ok(res.stdout.includes("IcaclsValidation_RejectsInheritedACLs"));
      assert.ok(res.stdout.includes("IcaclsValidation_RejectsPermissiveGroups"));
      assert.ok(res.stdout.includes("IcaclsValidation_RejectsMissingUserGrant"));
      assert.ok(res.stdout.includes("IcaclsValidation_AcceptsCleanExclusiveACL"));
    });

    it("T5.4.4: Linux XDG standard compliance and legacy fallback unit test suite passes with 100% assertions", async () => {
      const res = await runCommand(
        "go",
        ["test", "-v", "./src/host", "-run", "TestUserDataDir_LinuxXDGAndFallback"],
        { cwd: PROJECT_ROOT },
      );
      assert.equal(res.exitCode, 0, `Linux XDG tests failed:\n${res.stderr}`);
    });
  });
});
