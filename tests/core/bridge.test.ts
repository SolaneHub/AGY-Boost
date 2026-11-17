import { test as it, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DaemonBridge } from "../../src/client/bridge/daemon.js";

interface GlobalTokenScope {
  __AGY_TOKEN__?: string;
}

const tokenScope = globalThis as unknown as GlobalTokenScope;

describe("DaemonBridge", () => {
  const originalFetch = globalThis.fetch;
  let lastRequest: { url: string; init?: RequestInit | undefined } | null = null;
  let mockFetchHandler: (url: string, init?: RequestInit) => Promise<Response>;

  beforeEach(() => {
    lastRequest = null;
    mockFetchHandler = async () => new Response("ok", { status: 200 });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      lastRequest = { url, init };
      return mockFetchHandler(url, init);
    }) as typeof fetch;
    delete tokenScope.__AGY_TOKEN__;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete tokenScope.__AGY_TOKEN__;
  });

  it("isHealthy returns true on 200 OK and calls /health", async () => {
    mockFetchHandler = async (url) => {
      assert.match(url, /\/health$/u);
      return new Response("OK", { status: 200 });
    };

    const bridge = new DaemonBridge(42_042);
    const healthy = await bridge.isHealthy();
    assert.equal(healthy, true);
    assert.equal(lastRequest?.url, "http://127.0.0.1:42042/health");
  });

  it("isHealthy returns false on HTTP error or network failure", async () => {
    mockFetchHandler = async () => new Response("Service Unavailable", { status: 503 });

    const bridge = new DaemonBridge(42_042);
    assert.equal(await bridge.isHealthy(), false);

    mockFetchHandler = async () => {
      throw new Error("Connection refused");
    };
    assert.equal(await bridge.isHealthy(), false);
  });

  it("getMods calls /mods and includes X-AGY-Token header when configured", async () => {
    tokenScope.__AGY_TOKEN__ = "secret-token-xyz";

    const dummyMods = [
      {
        id: "test-mod",
        name: "Test Mod",
        version: "1.0.0",
        description: "Test description",
        enabled: true,
        path: "/path/to/mod",
      },
    ];

    mockFetchHandler = async (url, init) => {
      assert.match(url, /\/mods$/u);
      const headers = (init?.headers as Record<string, string>) || {};
      assert.equal(headers["X-AGY-Token"], "secret-token-xyz");
      return new Response(JSON.stringify(dummyMods), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const bridge = new DaemonBridge(9000);
    const mods = await bridge.getMods();

    assert.deepEqual(mods, dummyMods);
    assert.equal(lastRequest?.url, "http://127.0.0.1:9000/mods");
  });

  it("toggleMod sends POST to /mods/toggle with JSON body and auth header", async () => {
    tokenScope.__AGY_TOKEN__ = "token-123";

    mockFetchHandler = async (url, init) => {
      assert.match(url, /\/mods\/toggle$/u);
      assert.equal(init?.method, "POST");
      const headers = (init?.headers as Record<string, string>) || {};
      assert.equal(headers["Content-Type"], "application/json");
      assert.equal(headers["X-AGY-Token"], "token-123");
      const body = JSON.parse(init?.body as string);
      assert.deepEqual(body, { id: "mod-abc", enabled: false });
      return new Response("OK", { status: 200 });
    };

    const bridge = new DaemonBridge(42_042);
    const success = await bridge.toggleMod("mod-abc", false);
    assert.equal(success, true);
  });

  it("toggleMod returns false when daemon returns error status", async () => {
    mockFetchHandler = async () => new Response("Not found", { status: 404 });

    const bridge = new DaemonBridge(42_042);
    const success = await bridge.toggleMod("unknown-mod", true);
    assert.equal(success, false);
  });

  it("spawn and kill forward to spawnDaemon and killDaemon with global defaults", async () => {
    mockFetchHandler = async (url, init) => {
      if (url.endsWith("/daemon/spawn")) {
        const body = JSON.parse(init?.body as string);
        assert.equal(body.modId, "global");
        assert.equal(body.binaryPath, "./bin");
        return new Response(JSON.stringify({ ok: true, pid: 1234 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/daemon/kill")) {
        const body = JSON.parse(init?.body as string);
        assert.equal(body.modId, "global");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const bridge = new DaemonBridge(42_042);
    const spawnRes = await bridge.spawn("./bin");
    assert.equal(spawnRes.ok, true);
    assert.equal(spawnRes.pid, 1234);

    const killRes = await bridge.kill();
    assert.equal(killRes, true);
  });

  it("openModsFolder sends POST to /mods/open-folder and returns ok and path", async () => {
    tokenScope.__AGY_TOKEN__ = "test-token-open";

    mockFetchHandler = async (url, init) => {
      assert.match(url, /\/mods\/open-folder$/u);
      assert.equal(init?.method, "POST");
      const headers = (init?.headers as Record<string, string>) || {};
      assert.equal(headers["X-AGY-Token"], "test-token-open");
      return new Response(JSON.stringify({ ok: true, path: "/home/user/mods" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const bridge = new DaemonBridge(42_042);
    const res = await bridge.openModsFolder();
    assert.equal(res.ok, true);
    assert.equal(res.path, "/home/user/mods");
  });

  it("openModsFolder returns { ok: false } on server error or failure", async () => {
    mockFetchHandler = async () => new Response("Internal Server Error", { status: 500 });

    const bridge = new DaemonBridge(42_042);
    const res = await bridge.openModsFolder();
    assert.equal(res.ok, false);
  });
});
