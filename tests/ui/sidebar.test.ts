import { test as it, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const FIXTURE_PATH = path.join(rootDir, "tests", "fixtures", "mock-antigravity.html");
const DIST_BUNDLE_PATH = path.join(rootDir, "dist", "agy-boost.js");

function findChromeExecutable(): string | null {
  if (process.env["CHROME_BIN"] && fs.existsSync(process.env["CHROME_BIN"])) {
    return process.env["CHROME_BIN"];
  }

  if (process.env["CI"]) {
    return null;
  }

  const platform = os.platform();
  const candidates: string[] = [];

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    );
  } else if (platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    );
  } else if (platform === "win32") {
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] || "";
    candidates.push(
      path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
      path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
      path.join(localAppData, "Google/Chrome/Application/chrome.exe"),
    );
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const CHROME_PATH = findChromeExecutable();
const PORT = 9560;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendCdp(webSocketUrl: string, method: string, params: Record<string, unknown> = {}) {
  const socket = new WebSocket(webSocketUrl);
  let timer: NodeJS.Timeout | undefined;

  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP socket open failed")), {
        once: true,
      });
    });

    const id = Math.floor(Math.random() * 1_000_000);
    const reply = new Promise((resolve, reject) => {
      const messageHandler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.id !== id) return;
          clearTimeout(timer);
          socket.removeEventListener("message", messageHandler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } catch (err) {
          clearTimeout(timer);
          socket.removeEventListener("message", messageHandler);
          reject(err);
        }
      };

      socket.addEventListener("message", messageHandler);
      timer = setTimeout(() => {
        socket.removeEventListener("message", messageHandler);
        reject(new Error(`CDP ${method} timed out`));
      }, 30_000);
    });

    socket.send(JSON.stringify({ id, method, params }));
    return await reply;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    socket.close();
  }
}

async function evalInPage<T>(wsUrl: string, expression: string): Promise<T> {
  const result = (await sendCdp(wsUrl, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })) as {
    exceptionDetails?: unknown;
    result?: { value: T };
  };
  if (result.exceptionDetails) {
    throw new Error(`Eval failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value as T;
}

interface NavClasses {
  mods: string[];
  newChat: string[];
  auto: string[];
  cust: string[];
}

interface FlexboxInvariantState {
  inlineDisplay: string;
  computedFlex: string;
  child0Height: number;
  child1Height: number;
}

describe("Sidebar Navigation & Active State Manager (Headless Chrome via CDP)", () => {
  let chromeProc: ChildProcess | null = null;
  let tmpDir = "";
  let wsUrl = "";
  let httpServer: http.Server | null = null;
  let serverPort = 0;

  before(async () => {
    if (!CHROME_PATH) {
      return;
    }

    if (!fs.existsSync(DIST_BUNDLE_PATH)) {
      try {
        const { execSync } = await import("node:child_process");
        execSync("pnpm run build:client", { cwd: rootDir, stdio: "ignore" });
      } catch {
        // ignore build error, assert below will report missing file if needed
      }
    }

    assert.ok(
      fs.existsSync(DIST_BUNDLE_PATH),
      `dist/agy-boost.js must exist before running sidebar browser tests. Build it via 'pnpm build'`,
    );

    // Start a lightweight loopback HTTP server to serve the fixture and runtime bundle
    // with proper HTTP origin semantics (supporting history.pushState).
    await new Promise<void>((resolve, reject) => {
      httpServer = http.createServer((req, res) => {
        const reqPath = req.url ? req.url.split("?")[0] : "/";
        if (reqPath === "/dist/agy-boost.js" || reqPath === "/dist/dist/agy-boost.js") {
          res.writeHead(200, { "Content-Type": "application/javascript" });
          fs.createReadStream(DIST_BUNDLE_PATH).pipe(res);
          return;
        }

        // Serve mock-antigravity.html with rewritten script path to point to /dist/agy-boost.js
        let htmlContent = fs.readFileSync(FIXTURE_PATH, "utf-8");
        htmlContent = htmlContent.replace(
          'src="../../dist/agy-boost.js"',
          'src="/dist/agy-boost.js"',
        );

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlContent);
      });

      httpServer.listen(0, "127.0.0.1", () => {
        const addr = httpServer?.address();
        if (typeof addr === "object" && addr) {
          serverPort = addr.port;
          resolve();
        } else {
          reject(new Error("Failed to get ephemeral port for test server"));
        }
      });
      httpServer.on("error", reject);
    });

    tmpDir = await mkdtemp(path.join(os.tmpdir(), "agy-boost-sidebar-cdp-"));
    const serverUrl = `http://127.0.0.1:${serverPort}/`;

    chromeProc = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${tmpDir}`,
        serverUrl,
      ],
      { stdio: "ignore" },
    );

    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        if (res.ok) {
          const targets = (await res.json()) as Array<{
            type: string;
            url: string;
            webSocketDebuggerUrl: string;
          }>;
          const pageTarget = targets.find((tg) => tg.type === "page");
          if (pageTarget?.webSocketDebuggerUrl) {
            wsUrl = pageTarget.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {
        // Retry
      }
      await delay(200);
    }

    if (!wsUrl) {
      return;
    }

    await delay(300);

    let isReady = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const ready = await evalInPage<boolean>(
          wsUrl,
          `Boolean(
            document.readyState === "complete" &&
            window.AGYBoost &&
            window.__AGY_BOOST_INITIALIZED__ &&
            document.querySelector('[data-agy-boost-mods-btn="true"]') &&
            document.querySelector('[data-testid="conversation-view"]')
          )`,
        );
        if (ready) {
          isReady = true;
          break;
        }
      } catch {
        // Retry
      }
      await delay(200);
    }

    assert.ok(isReady, "AGYBoost runtime or mock DOM failed to mount within timeout");
  });

  after(async () => {
    if (chromeProc) {
      chromeProc.kill("SIGKILL");
      chromeProc = null;
    }
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
      httpServer = null;
    }
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup error
      }
    }
  });

  async function getNavClasses(): Promise<NavClasses> {
    return await evalInPage<NavClasses>(
      wsUrl,
      `(() => {
        const mods = document.querySelector('[data-agy-boost-mods-btn="true"]');
        const newChat = document.querySelector('[data-testid="new-conversation-button"]');
        const auto = document.querySelector('[data-testid="automations-button"]');
        const navContainer = document.querySelector('[data-testid="sidebar-navigation-items"]');
        const navChildren = navContainer ? Array.from(navContainer.children) : [];
        const cust = navChildren.find((el) => {
          if (el === mods || el === auto || el === newChat) return false;
          const text = el.textContent ? el.textContent.trim() : "";
          const href = el.getAttribute("href");
          return text === "Customizations" || href === "/customizations";
        }) || null;

        return {
          mods: mods ? Array.from(mods.classList) : [],
          newChat: newChat ? Array.from(newChat.classList) : [],
          auto: auto ? Array.from(auto.classList) : [],
          cust: cust ? Array.from(cust.classList) : [],
        };
      })()`,
    );
  }

  async function checkFlexboxInvariant(): Promise<FlexboxInvariantState> {
    return await evalInPage<FlexboxInvariantState>(
      wsUrl,
      `(() => {
        const conv = document.querySelector('[data-testid="conversation-view"]');
        const child0 = document.getElementById("child-0-messages");
        const child1 = document.getElementById("child-1-composer");
        return {
          inlineDisplay: conv ? conv.style.display : "NOT_FOUND",
          computedFlex: conv ? window.getComputedStyle(conv).display : "",
          child0Height: child0 ? child0.clientHeight : 0,
          child1Height: child1 ? child1.clientHeight : 0,
        };
      })()`,
    );
  }

  it("verifies initial sidebar layout and Willow styles in real DOM", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome not available; skipping");
      return;
    }

    const state = await getNavClasses();
    // Initially on /, newChat is active (bg-sidebar-secondary), others inactive
    assert.ok(
      state.newChat.includes("bg-sidebar-secondary"),
      "New Chat should have bg-sidebar-secondary",
    );
    assert.ok(!state.mods.includes("bg-sidebar-secondary"), "Mods should be inactive initially");
    assert.ok(!state.auto.includes("bg-sidebar-secondary"), "Auto should be inactive initially");
    assert.ok(!state.cust.includes("bg-sidebar-secondary"), "Cust should be inactive initially");

    // Invariant check
    const flex = await checkFlexboxInvariant();
    assert.notEqual(
      flex.inlineDisplay,
      "block",
      "inline display: block must NEVER be set on conversation-view",
    );
    assert.equal(flex.computedFlex, "flex");
    assert.ok(flex.child0Height > 0, "child0 message scroller must not collapse");
  });

  it("toggles active states through user clicks on Mods, Customizations, Automations, and New Chat", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome not available; skipping");
      return;
    }

    // 1. Activate Mods: click Mods button
    await evalInPage(
      wsUrl,
      `(() => {
        const mods = document.querySelector('[data-agy-boost-mods-btn="true"]');
        mods.click();
      })()`,
    );
    await delay(50);

    let state = await getNavClasses();
    assert.ok(state.mods.includes("bg-sidebar-secondary"), "Mods must be active");
    assert.ok(
      !state.newChat.includes("bg-sidebar-secondary"),
      "New Chat must not have bg-sidebar-secondary",
    );
    assert.ok(
      state.newChat.includes("hover:bg-sidebar-secondary"),
      "New Chat must have hover:bg-sidebar-secondary",
    );
    assert.ok(state.newChat.includes("bg-sidebar-muted"), "New Chat must have bg-sidebar-muted");
    assert.ok(
      !state.auto.includes("bg-sidebar-secondary"),
      "Auto must not have bg-sidebar-secondary",
    );
    assert.ok(
      state.auto.includes("hover:bg-sidebar-muted"),
      "Auto must have hover:bg-sidebar-muted",
    );
    assert.ok(
      !state.cust.includes("bg-sidebar-secondary"),
      "Cust must not have bg-sidebar-secondary",
    );
    assert.ok(
      state.cust.includes("hover:bg-sidebar-muted"),
      "Cust must have hover:bg-sidebar-muted",
    );

    // Verify Mods view overlay is open and flexbox invariant holds
    let isOpen = await evalInPage<boolean>(wsUrl, `window.AGYBoost.ui.isModsViewOpen()`);
    assert.equal(isOpen, true, "Mods view overlay should be open");
    let flex = await checkFlexboxInvariant();
    assert.notEqual(flex.inlineDisplay, "block");

    // 2. User clicks Customizations
    await evalInPage(
      wsUrl,
      `(() => {
        const navContainer = document.querySelector('[data-testid="sidebar-navigation-items"]');
        const cust = Array.from(navContainer.children).find((el) => el.textContent.trim() === "Customizations");
        cust.click();
      })()`,
    );
    await delay(50);

    state = await getNavClasses();
    assert.ok(!state.mods.includes("bg-sidebar-secondary"), "Mods must be inactive");
    assert.ok(
      state.mods.includes("hover:bg-sidebar-muted"),
      "Mods must have hover:bg-sidebar-muted",
    );
    assert.ok(state.cust.includes("bg-sidebar-secondary"), "Cust must be active");
    assert.ok(!state.newChat.includes("bg-sidebar-secondary"), "New Chat must be inactive");
    assert.ok(
      state.newChat.includes("hover:bg-sidebar-secondary"),
      "New Chat must have hover class",
    );
    assert.ok(!state.auto.includes("bg-sidebar-secondary"), "Auto must be inactive");
    assert.ok(state.auto.includes("hover:bg-sidebar-muted"), "Auto must have hover class");

    isOpen = await evalInPage<boolean>(wsUrl, `window.AGYBoost.ui.isModsViewOpen()`);
    assert.equal(
      isOpen,
      false,
      "Mods view overlay should close when clicking another sidebar item",
    );

    // 3. User clicks Automations
    await evalInPage(
      wsUrl,
      `(() => {
        const auto = document.querySelector('[data-testid="automations-button"]');
        auto.click();
      })()`,
    );
    await delay(50);

    state = await getNavClasses();
    assert.ok(!state.mods.includes("bg-sidebar-secondary"), "Mods must be inactive");
    assert.ok(
      state.mods.includes("hover:bg-sidebar-muted"),
      "Mods must have hover:bg-sidebar-muted",
    );
    assert.ok(!state.cust.includes("bg-sidebar-secondary"), "Cust must be inactive");
    assert.ok(
      state.cust.includes("hover:bg-sidebar-muted"),
      "Cust must have hover:bg-sidebar-muted",
    );
    assert.ok(!state.newChat.includes("bg-sidebar-secondary"), "New Chat must be inactive");
    assert.ok(
      state.newChat.includes("hover:bg-sidebar-secondary"),
      "New Chat must have hover class",
    );
    assert.ok(state.auto.includes("bg-sidebar-secondary"), "Auto must be active");

    // 4. User clicks New Conversation
    await evalInPage(
      wsUrl,
      `(() => {
        const newChat = document.querySelector('[data-testid="new-conversation-button"]');
        newChat.click();
      })()`,
    );
    await delay(50);

    state = await getNavClasses();
    assert.ok(state.newChat.includes("bg-sidebar-secondary"), "New Chat must be active");
    assert.ok(
      !state.newChat.includes("bg-sidebar-muted"),
      "New Chat must not have bg-sidebar-muted",
    );
    assert.ok(!state.auto.includes("bg-sidebar-secondary"), "Auto must be inactive");
    assert.ok(state.auto.includes("hover:bg-sidebar-muted"), "Auto must have hover class");
    assert.ok(!state.cust.includes("bg-sidebar-secondary"), "Cust must be inactive");
    assert.ok(state.cust.includes("hover:bg-sidebar-muted"), "Cust must have hover class");
    assert.ok(!state.mods.includes("bg-sidebar-secondary"), "Mods must be inactive");
    assert.ok(state.mods.includes("hover:bg-sidebar-muted"), "Mods must have hover class");

    // 5. User re-opens Mods view
    await evalInPage(
      wsUrl,
      `(() => {
        const mods = document.querySelector('[data-agy-boost-mods-btn="true"]');
        mods.click();
      })()`,
    );
    await delay(50);

    state = await getNavClasses();
    assert.ok(state.mods.includes("bg-sidebar-secondary"), "Mods must be active");
    assert.ok(!state.newChat.includes("bg-sidebar-secondary"), "New Chat must not be active");
    assert.ok(
      state.newChat.includes("hover:bg-sidebar-secondary"),
      "New Chat must have hover class",
    );
    assert.ok(!state.auto.includes("bg-sidebar-secondary"), "Auto must not be active");
    assert.ok(state.auto.includes("hover:bg-sidebar-muted"), "Auto must have hover class");
    assert.ok(!state.cust.includes("bg-sidebar-secondary"), "Cust must not be active");
    assert.ok(state.cust.includes("hover:bg-sidebar-muted"), "Cust must have hover class");
  });

  it("switches active state correctly on programmatic close based on window.location pathname", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome not available; skipping");
      return;
    }

    // Ensure Mods is open
    await evalInPage(
      wsUrl,
      `(() => {
        if (!window.AGYBoost.ui.isModsViewOpen()) {
          window.AGYBoost.ui.openModsView();
        }
      })()`,
    );
    await delay(50);

    // 6. User closes Mods via closeModsView() while on /
    await evalInPage(
      wsUrl,
      `(() => {
        history.pushState({}, "", "/");
        window.AGYBoost.ui.closeModsView();
      })()`,
    );
    await delay(50);

    let state = await getNavClasses();
    assert.ok(state.newChat.includes("bg-sidebar-secondary"), "New Chat must be active on /");
    assert.ok(!state.mods.includes("bg-sidebar-secondary"));
    assert.ok(state.mods.includes("hover:bg-sidebar-muted"));
    assert.ok(!state.auto.includes("bg-sidebar-secondary"));
    assert.ok(state.auto.includes("hover:bg-sidebar-muted"));
    assert.ok(!state.cust.includes("bg-sidebar-secondary"));
    assert.ok(state.cust.includes("hover:bg-sidebar-muted"));

    // 7. Open Mods, then close while on /customizations
    await evalInPage(
      wsUrl,
      `(() => {
        window.AGYBoost.ui.openModsView();
        history.pushState({}, "", "/customizations");
        window.AGYBoost.ui.closeModsView();
      })()`,
    );
    await delay(50);

    state = await getNavClasses();
    assert.ok(!state.newChat.includes("bg-sidebar-secondary"));
    assert.ok(state.newChat.includes("hover:bg-sidebar-secondary"));
    assert.ok(!state.mods.includes("bg-sidebar-secondary"));
    assert.ok(state.mods.includes("hover:bg-sidebar-muted"));
    assert.ok(
      state.cust.includes("bg-sidebar-secondary"),
      "Customizations must be active on /customizations",
    );
    assert.ok(!state.auto.includes("bg-sidebar-secondary"));
    assert.ok(state.auto.includes("hover:bg-sidebar-muted"));

    // 8. Open Mods, then close while on /sidecars
    await evalInPage(
      wsUrl,
      `(() => {
        window.AGYBoost.ui.openModsView();
        history.pushState({}, "", "/sidecars");
        window.AGYBoost.ui.closeModsView();
      })()`,
    );
    await delay(50);

    state = await getNavClasses();
    assert.ok(!state.newChat.includes("bg-sidebar-secondary"));
    assert.ok(state.newChat.includes("hover:bg-sidebar-secondary"));
    assert.ok(!state.mods.includes("bg-sidebar-secondary"));
    assert.ok(
      state.auto.includes("bg-sidebar-secondary"),
      "Automations must be active on /sidecars",
    );
    assert.ok(!state.cust.includes("bg-sidebar-secondary"));
    assert.ok(state.cust.includes("hover:bg-sidebar-muted"));

    // 9. Open Mods, then close while in a conversation /c/123
    await evalInPage(
      wsUrl,
      `(() => {
        window.AGYBoost.ui.openModsView();
        history.pushState({}, "", "/c/123");
        window.AGYBoost.ui.closeModsView();
      })()`,
    );
    await delay(50);

    state = await getNavClasses();
    assert.ok(!state.newChat.includes("bg-sidebar-secondary"));
    assert.ok(state.newChat.includes("hover:bg-sidebar-secondary"));
    assert.ok(!state.mods.includes("bg-sidebar-secondary"));
    assert.ok(!state.auto.includes("bg-sidebar-secondary"));
    assert.ok(state.auto.includes("hover:bg-sidebar-muted"));
    assert.ok(!state.cust.includes("bg-sidebar-secondary"));
    assert.ok(state.cust.includes("hover:bg-sidebar-muted"));

    // Final Flexbox Invariant Check
    const flex = await checkFlexboxInvariant();
    assert.notEqual(
      flex.inlineDisplay,
      "block",
      "inline display: block must NEVER be set on conversation-view",
    );
    assert.equal(flex.computedFlex, "flex", "conversation-view computed flex must remain 'flex'");
    assert.ok(flex.child0Height > 0, "child0 message scroller must remain expanded");
    assert.ok(flex.child1Height > 0, "child1 composer box must remain visible");
  });
});
