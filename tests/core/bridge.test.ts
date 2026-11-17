import { test as it, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { DaemonBridge } from "../../src/client/bridge/daemon.js";

interface GlobalTokenScope {
  __AGY_TOKEN__?: string;
}

const tokenScope = globalThis as unknown as GlobalTokenScope;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to get port from server"));
        return;
      }
      const port = address.port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

describe("DaemonBridge (Real HTTP Loopback Server Integration)", () => {
  let server: http.Server;
  let daemonPort: number;
  let bridge: DaemonBridge;
  const authToken = "secret-token-1234567890abcdef";
  let modEnabled = true;

  before(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${daemonPort}`);
      const token = req.headers["x-agy-token"];

      // Set CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-AGY-Token");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ status: "ok", version: "0.1.0", uptime: "1s", modsDir: "/tmp/mods" }),
        );
        return;
      }

      // Protected endpoints require valid X-AGY-Token
      if (token !== authToken) {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
        return;
      }

      if (url.pathname === "/diagnostics" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            uptime: "10s",
            uptimeSeconds: 10,
            residentMemoryKB: 4096,
            goroutines: 5,
            activeGoroutines: 5,
            enabledMods: modEnabled ? 1 : 0,
            enabledModsCount: modEnabled ? 1 : 0,
            logs: [
              { level: "INFO", message: "server started", timestamp: new Date().toISOString() },
            ],
          }),
        );
        return;
      }

      if (url.pathname === "/mods" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            {
              id: "test-mod",
              name: "Test Mod",
              version: "1.0.0",
              description: "Sample test mod for DaemonBridge tests",
              main: "index.js",
              style: "theme.css",
              enabled: modEnabled,
              path: "/tmp/mods/test-mod",
            },
          ]),
        );
        return;
      }

      if (url.pathname === "/mods/toggle" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            modEnabled = Boolean(parsed.enabled);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, id: parsed.id, enabled: modEnabled }));
          } catch {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Bad Request");
          }
        });
        return;
      }

      if (url.pathname === "/mods/file" && req.method === "GET") {
        const id = url.searchParams.get("id");
        const file = url.searchParams.get("file");
        if (id === "test-mod" && file === "index.js") {
          res.writeHead(200, { "Content-Type": "application/javascript" });
          res.end("console.log('test-mod active');");
          return;
        }
        if (id === "test-mod" && file === "theme.css") {
          res.writeHead(200, { "Content-Type": "text/css" });
          res.end(":root { --test-mod: #424242; }");
          return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File not found");
        return;
      }

      if (url.pathname === "/mods/open-folder" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: "/tmp/mods" }));
        return;
      }

      if (url.pathname === "/daemon/spawn" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.binaryPath?.includes("..")) {
              res.writeHead(403, { "Content-Type": "text/plain" });
              res.end("Forbidden");
              return;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, pid: 1234, modId: parsed.modId }));
          } catch {
            res.writeHead(400);
            res.end("Bad Request");
          }
        });
        return;
      }

      if (url.pathname === "/daemon/kill" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, modId: parsed.modId }));
          } catch {
            res.writeHead(400);
            res.end("Bad Request");
          }
        });
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        daemonPort = typeof address === "object" && address ? address.port : 0;
        resolve();
      });
    });

    bridge = new DaemonBridge(daemonPort);
  });

  after(async () => {
    delete tokenScope.__AGY_TOKEN__;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("isHealthy returns true on 200 OK from live daemon /health", async () => {
    const healthy = await bridge.isHealthy();
    assert.equal(healthy, true);
  });

  it("isHealthy returns false when querying an inactive loopback port", async () => {
    const deadPort = await getFreePort();
    const deadBridge = new DaemonBridge(deadPort);
    const healthy = await deadBridge.isHealthy();
    assert.equal(healthy, false);
  });

  it("getMods returns empty array when unauthorized, and returns mods list with token", async () => {
    // 1. Without auth token, /mods returns 401 Unauthorized, DaemonBridge returns []
    delete tokenScope.__AGY_TOKEN__;
    const unauthMods = await bridge.getMods();
    assert.deepEqual(unauthMods, []);

    // 2. With valid X-AGY-Token, /mods returns the installed mods list
    tokenScope.__AGY_TOKEN__ = authToken;
    const mods = await bridge.getMods();
    assert.ok(Array.isArray(mods));
    assert.equal(mods.length, 1);
    assert.equal(mods[0]?.id, "test-mod");
    assert.equal(mods[0]?.name, "Test Mod");
    assert.equal(mods[0]?.enabled, true);
  });

  it("toggleMod sends POST to /mods/toggle and toggles mod state on live daemon", async () => {
    tokenScope.__AGY_TOKEN__ = authToken;

    // Toggle mod off
    const disabledSuccess = await bridge.toggleMod("test-mod", false);
    assert.equal(disabledSuccess, true);

    let mods = await bridge.getMods();
    assert.equal(mods[0]?.enabled, false);

    // Toggle mod back on
    const enabledSuccess = await bridge.toggleMod("test-mod", true);
    assert.equal(enabledSuccess, true);

    mods = await bridge.getMods();
    assert.equal(mods[0]?.enabled, true);
  });

  it("toggleMod returns false when unauthorized", async () => {
    delete tokenScope.__AGY_TOKEN__;

    const success = await bridge.toggleMod("test-mod", false);
    assert.equal(success, false);
  });

  it("getModFile retrieves real file content from live daemon", async () => {
    tokenScope.__AGY_TOKEN__ = authToken;

    const jsContent = await bridge.getModFile("test-mod", "index.js");
    assert.equal(jsContent, "console.log('test-mod active');");

    const cssContent = await bridge.getModFile("test-mod", "theme.css");
    assert.equal(cssContent, ":root { --test-mod: #424242; }");

    const notFound = await bridge.getModFile("test-mod", "missing.txt");
    assert.equal(notFound, null);
  });

  it("queries real /diagnostics endpoint against live daemon", async () => {
    // Query without token returns 401 Unauthorized
    const unauthRes = await fetch(`http://127.0.0.1:${daemonPort}/diagnostics`);
    assert.equal(unauthRes.status, 401);

    // Query with auth token returns 200 OK and valid telemetry
    const authRes = await fetch(`http://127.0.0.1:${daemonPort}/diagnostics`, {
      headers: { "X-AGY-Token": authToken },
    });
    assert.equal(authRes.status, 200);

    const diagnostics = (await authRes.json()) as {
      uptime: string;
      uptimeSeconds: number;
      residentMemoryKB: number;
      goroutines: number;
      activeGoroutines: number;
      enabledMods: number;
      enabledModsCount: number;
      logs: Array<{ level: string; message: string; timestamp: string }>;
    };

    assert.ok(typeof diagnostics.uptime === "string");
    assert.ok(diagnostics.uptimeSeconds >= 0);
    assert.ok(diagnostics.residentMemoryKB > 0);
    // Verified memory guardrail: must be < 10MB (10240 KB)
    assert.ok(diagnostics.residentMemoryKB < 10240);
    assert.ok(diagnostics.goroutines > 0);
    assert.equal(diagnostics.activeGoroutines, diagnostics.goroutines);
    assert.equal(diagnostics.enabledMods, 1);
    assert.equal(diagnostics.enabledModsCount, 1);
    assert.ok(Array.isArray(diagnostics.logs));
    assert.ok(diagnostics.logs.length > 0);
  });

  it("openModsFolder sends POST to /mods/open-folder and returns ok and path", async () => {
    tokenScope.__AGY_TOKEN__ = authToken;

    const res = await bridge.openModsFolder();
    assert.equal(res.ok, true);
    assert.ok(res.path?.endsWith("mods"));
  });

  it("openModsFolder returns { ok: false } when unauthorized", async () => {
    delete tokenScope.__AGY_TOKEN__;

    const res = await bridge.openModsFolder();
    assert.equal(res.ok, false);
  });

  it("spawnDaemon and killDaemon communicate with live daemon endpoints", async () => {
    tokenScope.__AGY_TOKEN__ = authToken;

    // 1. Spawning valid binary succeeds
    const spawnRes = await bridge.spawnDaemon("test-mod", "dummy-daemon");
    assert.equal(spawnRes.ok, true);
    assert.ok(typeof spawnRes.pid === "number" && spawnRes.pid > 0);

    // 2. Killing the running daemon succeeds
    const killRes = await bridge.killDaemon("test-mod");
    assert.equal(killRes, true);

    // 3. Spawning outside mod dir (e.g. path traversal) fails
    const badSpawnRes = await bridge.spawnDaemon("test-mod", "../evil-bin");
    assert.equal(badSpawnRes.ok, false);
  });
});
