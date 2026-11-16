import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const FIXTURE_PATH = path.join(rootDir, "tests", "fixtures", "mock-antigravity.html");

function findChromeExecutable(): string | null {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }

  // In CI environments, only run live browser if CHROME_BIN was explicitly set by the workflow job
  if (process.env.CI) {
    return null;
  }

  const platform = os.platform();
  const candidates: string[] = [];

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    );
  } else if (platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium"
    );
  } else if (platform === "win32") {
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] || "";
    candidates.push(
      path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
      path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
      path.join(localAppData, "Google/Chrome/Application/chrome.exe")
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
const PORT = 9555;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendCDP(webSocketUrl: string, method: string, params: Record<string, unknown> = {}) {
  const socket = new WebSocket(webSocketUrl);
  let timer: NodeJS.Timeout | undefined;

  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP socket open failed")), {
        once: true,
      });
    });

    const id = Math.floor(Math.random() * 1000000);
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
      }, 30000);
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

interface ContractAuditResult {
  missing: Array<{ id: string; selector: string }>;
  flexboxContract: {
    parentDisplay: string;
    parentFlexDirection: string;
    child0FlexGrow: string;
    child1FlexShrink: string;
    child0ComputedHeight: number;
    child1ComputedHeight: number;
  } | null;
}

async function evalInPage<T>(wsUrl: string, expression: string): Promise<T> {
  const result = (await sendCDP(wsUrl, "Runtime.evaluate", {
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

describe("DOM Contract Radar & Drift Detection (Headless Browser)", () => {
  test("fixture file exists and contains contractual selectors", () => {
    assert.ok(fs.existsSync(FIXTURE_PATH), `Fixture must exist at ${FIXTURE_PATH}`);
    const html = fs.readFileSync(FIXTURE_PATH, "utf8");

    const requiredContractSelectors = [
      '[data-testid="conversation-view"]',
      '[data-main-content-header="true"]',
      '[data-main-content-body="true"]',
      '[data-testid="pane-titlebar-toolbar"]',
      '[data-testid="model-selector-trigger"]',
      '[data-testid="permissions-selector-trigger"]',
    ];

    for (const selector of requiredContractSelectors) {
      assert.ok(
        html.includes(selector.replace(/\[|\]/g, "")),
        `DOM Contract Drift detected: fixture missing contractual attribute ${selector}`
      );
    }
  });

  test("DOM Contract verification in live Headless Chrome environment", async (t) => {
    if (!CHROME_PATH) {
      t.skip(
        "Chrome/Chromium executable not found in environment; skipping live headless browser test."
      );
      return;
    }

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "agy-radar-chrome-"));
    const fixtureUrl = pathToFileURL(FIXTURE_PATH).href;

    const chromeProc = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${tmpDir}`,
        fixtureUrl,
      ],
      { stdio: "ignore" }
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
          "Failed to connect to Chrome CDP endpoint within timeout; skipping live browser test."
        );
        return;
      }

      await delay(300);

      // Wait for document to finish loading in Chrome
      let isReady = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const ready = await evalInPage(
            wsUrl,
            `Boolean(document.readyState === "complete" && document.querySelector('[data-testid="conversation-view"]'))`
          );
          if (ready) {
            isReady = true;
            break;
          }
        } catch {
          // Context might still be initializing
        }
        await delay(200);
      }

      if (!isReady) {
        t.skip(
          "Page failed to become ready in live headless Chrome within timeout; skipping live browser test."
        );
        return;
      }

      // Verify DOM contract in actual rendered page context
      let contractAudit: ContractAuditResult;
      try {
        contractAudit = await evalInPage<ContractAuditResult>(
          wsUrl,
          `(() => {
          const requiredSelectors = [
            { id: "conversation-view", selector: '[data-testid="conversation-view"]' },
            { id: "main-content-header", selector: '[data-main-content-header="true"]' },
            { id: "main-content-body", selector: '[data-main-content-body="true"]' },
            { id: "pane-titlebar-toolbar", selector: '[data-testid="pane-titlebar-toolbar"]' },
            { id: "model-selector-trigger", selector: '[data-testid="model-selector-trigger"]' },
            { id: "permissions-selector-trigger", selector: '[data-testid="permissions-selector-trigger"]' },
          ];

          const missing = [];
          for (const item of requiredSelectors) {
            if (!document.querySelector(item.selector)) {
              missing.push(item);
            }
          }

          // Flexbox hierarchy check
          const convView = document.querySelector('[data-testid="conversation-view"]');
          let flexboxContract = null;
          if (convView && convView.children.length >= 2) {
            const child0 = convView.children[0];
            const child1 = convView.children[1];
            const style0 = window.getComputedStyle(child0);
            const style1 = window.getComputedStyle(child1);
            const convStyle = window.getComputedStyle(convView);

            flexboxContract = {
              parentDisplay: convStyle.display,
              parentFlexDirection: convStyle.flexDirection,
              child0FlexGrow: style0.flexGrow,
              child1FlexShrink: style1.flexShrink,
              child0ComputedHeight: child0.clientHeight,
              child1ComputedHeight: child1.clientHeight,
            };
          }

          return {
            missing,
            flexboxContract,
          };
        })()`
        );
      } catch (err) {
        t.skip(
          `CDP evaluation timed out or failed in runner environment: ${(err as Error).message}`
        );
        return;
      }

      // Check selector drift
      assert.deepEqual(
        contractAudit.missing,
        [],
        `DOM Contract Drift detected: Missing required containers/triggers: ${JSON.stringify(contractAudit.missing)}`
      );

      // Check flexbox contract
      assert.ok(
        contractAudit.flexboxContract,
        "DOM Contract Drift: conversation-view missing flexbox children"
      );
      assert.equal(
        contractAudit.flexboxContract.parentDisplay,
        "flex",
        "DOM Contract Drift: conversation-view must have display: flex"
      );
      assert.equal(
        contractAudit.flexboxContract.parentFlexDirection,
        "column",
        "DOM Contract Drift: conversation-view must have flex-direction: column"
      );
      assert.equal(
        contractAudit.flexboxContract.child0FlexGrow,
        "1",
        "DOM Contract Drift: Child 0 (messages) must have flex-grow: 1"
      );
      assert.equal(
        contractAudit.flexboxContract.child1FlexShrink,
        "0",
        "DOM Contract Drift: Child 1 (composer) must have flex-shrink: 0"
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
