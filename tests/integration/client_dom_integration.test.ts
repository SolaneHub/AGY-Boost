import { test as it, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const PORT = 9556;
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

interface BoostRuntimeCheck {
  isInitialized: boolean;
  version: string;
  hasDiagnostics: boolean;
  hasSlots: boolean;
  sidebarButtonMounted: boolean;
  htmlDatasetMarked: boolean;
}

interface LayoutDiagnosticsResult {
  conversationViewPresent: boolean;
  inlineDisplay: string;
  computedFlex: string;
  child0Height: number;
  child1Height: number;
  isClean: boolean;
}

describe("Client DOM Integration (Headless Chrome via CDP)", () => {
  it("pre-requisite bundle dist/agy-boost.js exists", async () => {
    if (!CHROME_PATH) {
      return;
    }
    if (!fs.existsSync(DIST_BUNDLE_PATH)) {
      try {
        const { execSync } = await import("node:child_process");
        execSync("pnpm run build:client", { cwd: rootDir, stdio: "ignore" });
      } catch {
        // ignore
      }
    }
    assert.ok(
      fs.existsSync(DIST_BUNDLE_PATH),
      `dist/agy-boost.js must exist before running DOM integration test. Build it via 'pnpm build'`,
    );
  });

  it("verifies agy-boost bundle mounting, layout diagnostics, and flexbox invariant enforcement", async (t) => {
    if (!CHROME_PATH) {
      t.skip(
        "Chrome/Chromium executable not found in environment; skipping live headless browser test.",
      );
      return;
    }

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "agy-boost-dom-integration-"));
    const fixtureUrl = pathToFileURL(FIXTURE_PATH).href;

    const chromeProc = spawn(
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
        fixtureUrl,
      ],
      { stdio: "ignore" },
    );

    let wsUrl = "";
    try {
      // Connect to CDP endpoint
      for (let attempt = 0; attempt < 40; attempt++) {
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
        t.skip(
          "Failed to connect to Chrome CDP endpoint within timeout; skipping live browser test.",
        );
        return;
      }

      await delay(300);

      // Wait for document and AGYBoost runtime to mount and initialize
      let isReady = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const ready = await evalInPage<boolean>(
            wsUrl,
            `Boolean(
              document.readyState === "complete" &&
              window.AGYBoost &&
              window.__AGY_BOOST_INITIALIZED__ &&
              document.querySelector('[data-testid="conversation-view"]')
            )`,
          );
          if (ready) {
            isReady = true;
            break;
          }
        } catch {
          // Context still initializing
        }
        await delay(200);
      }

      assert.ok(isReady, "AGYBoost runtime or mock DOM failed to mount within timeout");

      // 1. Verify correct mounting of the bundle and runtime state
      const runtimeCheck = await evalInPage<BoostRuntimeCheck>(
        wsUrl,
        `(() => {
          return {
            isInitialized: Boolean(window.__AGY_BOOST_INITIALIZED__),
            version: window.AGYBoost?.version || "",
            hasDiagnostics: Boolean(window.__AGY_DIAGNOSTICS__ && window.AGYBoost?.diagnostics),
            hasSlots: typeof window.AGYBoost?.ui?.getLayoutDiagnostics === "function",
            sidebarButtonMounted: Boolean(document.querySelector('[data-agy-boost-mods-btn="true"]')),
            htmlDatasetMarked: document.documentElement.dataset?.agyBoostLoaded === "true",
          };
        })()`,
      );

      assert.equal(
        runtimeCheck.isInitialized,
        true,
        "Runtime should set __AGY_BOOST_INITIALIZED__",
      );
      assert.ok(runtimeCheck.version.length > 0, "AGYBoost.version should be non-empty");
      assert.equal(runtimeCheck.hasDiagnostics, true, "Diagnostics engine should be exposed");
      assert.equal(runtimeCheck.hasSlots, true, "ui.getLayoutDiagnostics should be exposed");
      assert.equal(
        runtimeCheck.sidebarButtonMounted,
        true,
        "Sidebar button should be mounted in DOM",
      );
      assert.equal(
        runtimeCheck.htmlDatasetMarked,
        true,
        "HTML root dataset.agyBoostLoaded should be true",
      );

      // 2. Verify layout diagnostics functioning
      const diagnosticsResult = await evalInPage<LayoutDiagnosticsResult>(
        wsUrl,
        `window.AGYBoost.ui.getLayoutDiagnostics()`,
      );

      assert.equal(
        diagnosticsResult.conversationViewPresent,
        true,
        "conversationViewPresent should be true",
      );
      assert.equal(diagnosticsResult.inlineDisplay, "", "inlineDisplay should initially be empty");
      assert.equal(diagnosticsResult.computedFlex, "flex", "computedFlex must be 'flex'");
      assert.ok(diagnosticsResult.child0Height > 0, "child0Height (messages) should be > 0");
      assert.ok(diagnosticsResult.child1Height > 0, "child1Height (composer) should be > 0");
      assert.equal(diagnosticsResult.isClean, true, "Layout diagnostics isClean must be true");

      // 3. Absolute absence of inline display: block & enforcement of Flexbox invariant
      // Test A: Initial state
      const initialInlineDisplay = await evalInPage<string>(
        wsUrl,
        `(() => {
          const conv = document.querySelector('[data-testid="conversation-view"]');
          return conv ? conv.style.display : "NOT_FOUND";
        })()`,
      );
      assert.notEqual(
        initialInlineDisplay,
        "block",
        "Initial conversation-view style.display must never be 'block'",
      );

      // Test B: Tamper test - attempt to inject style.display = 'block'
      // enforceConversationLayoutInvariant MutationObserver must defensively clear it immediately!
      const tamperResult = await evalInPage<{
        beforeStyle: string;
        afterStyle: string;
      }>(
        wsUrl,
        `(() => {
          const conv = document.querySelector('[data-testid="conversation-view"]');
          if (!conv) return { beforeStyle: "NOT_FOUND", afterStyle: "NOT_FOUND" };
          // Attempt malicious tamper
          conv.style.display = "block";
          const beforeStyle = conv.style.display;
          return { beforeStyle, afterStyle: conv.style.display };
        })()`,
      );

      assert.equal(tamperResult.beforeStyle, "block");

      // Wait 100ms for MutationObserver / sanitizeDisplay to clear inline block
      await delay(100);

      const postTamperDiagnostics = await evalInPage<LayoutDiagnosticsResult>(
        wsUrl,
        `window.AGYBoost.ui.getLayoutDiagnostics()`,
      );

      assert.notEqual(
        postTamperDiagnostics.inlineDisplay,
        "block",
        "enforceConversationLayoutInvariant MUST clear inline display: block",
      );
      assert.equal(
        postTamperDiagnostics.inlineDisplay,
        "",
        "inlineDisplay should be reset to empty",
      );
      assert.equal(postTamperDiagnostics.computedFlex, "flex", "computedFlex must remain 'flex'");
      assert.equal(
        postTamperDiagnostics.isClean,
        true,
        "isClean must remain true after auto-sanitization",
      );
    } finally {
      try {
        chromeProc.kill("SIGKILL");
      } catch {
        // ignore
      }
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});
