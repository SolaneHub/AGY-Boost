import { test as it, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const FIXTURE_PATH = path.join(rootDir, "tests", "fixtures", "mock-antigravity.html");
const DIST_BUNDLE_PATH = path.join(rootDir, "dist", "agy-boost.js");
const MOD_DETAIL_ENTRY = path.join(rootDir, "src", "client", "ui", "marketplace", "mod-detail.ts");

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
const PORT = 9565;
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

describe("Mod Detail View & Marketplace Tabs (Headless Chrome via CDP)", () => {
  let chromeProc: ChildProcess | null = null;
  let tmpDir = "";
  let wsUrl = "";

  before(async () => {
    assert.ok(
      fs.existsSync(DIST_BUNDLE_PATH),
      `dist/agy-boost.js must exist before running DOM tests. Build via 'pnpm build'`,
    );

    if (!CHROME_PATH) {
      return;
    }

    tmpDir = await mkdtemp(path.join(os.tmpdir(), "agy-boost-mod-detail-test-"));
    const fixtureUrl = pathToFileURL(FIXTURE_PATH).href;

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
        fixtureUrl,
      ],
      { stdio: "ignore" },
    );

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
      await delay(100);
    }

    assert.ok(wsUrl, "Failed to connect to Headless Chrome CDP endpoint");

    // Wait for document & runtime initialization
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const ready = await evalInPage<boolean>(
          wsUrl,
          `Boolean(document.readyState === "complete" && window.AGYBoost && window.__AGY_BOOST_INITIALIZED__)`,
        );
        if (ready) break;
      } catch {}
      await delay(100);
    }

    // Bundle mod-detail module in-memory to inject directly into Chrome's real DOM
    const modDetailBuild = await esbuild.build({
      entryPoints: [MOD_DETAIL_ENTRY],
      bundle: true,
      format: "iife",
      globalName: "ModDetailModule",
      footer: { js: "globalThis.ModDetailModule = ModDetailModule;" },
      write: false,
    });
    const modDetailSource = modDetailBuild.outputFiles[0]?.text || "";

    // Inject mod-detail module and create real container inside page
    await evalInPage(
      wsUrl,
      `(() => {
        ${modDetailSource}

        window.__testContainer = document.createElement("div");
        window.__testContainer.id = "agy-test-mod-detail-container";
        document.body.appendChild(window.__testContainer);

        window.__mockBridge = {
          isHealthy: async () => true,
          getMods: async () => [
            {
              id: "effort-optimizer",
              name: "Effort Optimizer",
              version: "1.0.0",
              description: "Fine-tune AI reasoning depth and token budgets in real-time.",
              enabled: true,
            },
          ],
          toggleMod: async () => true,
          openModsFolder: async () => ({ ok: true }),
        };
      })()`,
    );
  });

  after(async () => {
    if (chromeProc) {
      try {
        chromeProc.kill("SIGKILL");
      } catch {}
    }
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("renders 1:1 plugin detail shell with correct testid, title, and back button", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome executable not found; skipping");
      return;
    }

    const result = await evalInPage<{
      hasShell: boolean;
      title: string;
      hasBackButton: boolean;
      backTriggered: boolean;
    }>(
      wsUrl,
      `(async () => {
        const container = window.__testContainer;
        container.innerHTML = "";
        let backCalled = false;

        const options = {
          modId: "effort-optimizer",
          sourceTab: "marketplace",
          bridge: window.__mockBridge,
          onBack: () => {
            backCalled = true;
          },
          onRefresh: () => {},
        };

        await window.ModDetailModule.renderModDetail(container, options);

        const detailShell = container.querySelector('[data-testid="plugin-detail"]');
        const h1 = container.querySelector("h1");
        const backBtn = container.querySelector('[data-testid="plugin-detail-back-button"]');

        if (backBtn) {
          backBtn.click();
        }

        return {
          hasShell: detailShell !== null,
          title: h1 ? h1.textContent || "" : "",
          hasBackButton: backBtn !== null,
          backTriggered: backCalled,
        };
      })()`,
    );

    assert.equal(result.hasShell, true, "plugin-detail shell must exist");
    assert.equal(result.title, "Effort Optimizer");
    assert.equal(result.hasBackButton, true, "Back button must exist");
    assert.equal(result.backTriggered, true, "onBack must be invoked when clicking back");
  });

  it("renders suggested prompts list for catalog mod in real DOM", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome executable not found; skipping");
      return;
    }

    const result = await evalInPage<{
      hasPromptList: boolean;
      promptRowCount: number;
    }>(
      wsUrl,
      `(async () => {
        const container = window.__testContainer;
        container.innerHTML = "";

        await window.ModDetailModule.renderModDetail(container, {
          modId: "effort-optimizer",
          sourceTab: "marketplace",
          bridge: window.__mockBridge,
          onBack: () => {},
          onRefresh: () => {},
        });

        const promptList = container.querySelector('[data-testid="plugin-suggested-prompt-list"]');
        const rows = container.querySelectorAll('[data-testid="plugin-suggested-prompt-row"]');

        return {
          hasPromptList: promptList !== null,
          promptRowCount: rows.length,
        };
      })()`,
    );

    assert.equal(result.hasPromptList, true, "Suggested prompts list should be rendered");
    assert.ok(result.promptRowCount > 0, "Should have at least one suggested prompt row");
  });

  it("renders Overview and Skills tabs and switches panels in real DOM", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome executable not found; skipping");
      return;
    }

    const result = await evalInPage<{
      hasTabOverview: boolean;
      hasTabSkills: boolean;
      hasTabpanel: boolean;
      initialOverviewSelected: string | null;
      initialSkillsSelected: string | null;
      hasMarkdownRoot: boolean;
      afterClickSkillsSelected: string | null;
      afterClickOverviewSelected: string | null;
    }>(
      wsUrl,
      `(async () => {
        const container = window.__testContainer;
        container.innerHTML = "";

        await window.ModDetailModule.renderModDetail(container, {
          modId: "effort-optimizer",
          sourceTab: "marketplace",
          bridge: window.__mockBridge,
          onBack: () => {},
          onRefresh: () => {},
        });

        const tabOverview = container.querySelector("#plugin-detail-tab-overview");
        const tabSkills = container.querySelector("#plugin-detail-tab-skills");
        const tabpanel = container.querySelector("#plugin-detail-tabpanel");

        const initialOverviewSelected = tabOverview?.getAttribute("aria-selected") ?? null;
        const initialSkillsSelected = tabSkills?.getAttribute("aria-selected") ?? null;
        const hasMarkdownRoot = container.querySelector("[data-markdown-root]") !== null;

        // Click Skills
        if (tabSkills) {
          tabSkills.click();
        }

        const afterClickSkillsSelected = tabSkills?.getAttribute("aria-selected") ?? null;
        const afterClickOverviewSelected = tabOverview?.getAttribute("aria-selected") ?? null;

        return {
          hasTabOverview: tabOverview !== null,
          hasTabSkills: tabSkills !== null,
          hasTabpanel: tabpanel !== null,
          initialOverviewSelected,
          initialSkillsSelected,
          hasMarkdownRoot,
          afterClickSkillsSelected,
          afterClickOverviewSelected,
        };
      })()`,
    );

    assert.equal(result.hasTabOverview, true);
    assert.equal(result.hasTabSkills, true);
    assert.equal(result.hasTabpanel, true);
    assert.equal(result.initialOverviewSelected, "true");
    assert.equal(result.initialSkillsSelected, "false");
    assert.equal(result.hasMarkdownRoot, true, "Readme markdown root should exist in Overview");
    assert.equal(result.afterClickSkillsSelected, "true");
    assert.equal(result.afterClickOverviewSelected, "false");
  });

  it("renders metadata footer with version and author in real DOM", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome executable not found; skipping");
      return;
    }

    const result = await evalInPage<{
      hasFooter: boolean;
      versionText: string;
    }>(
      wsUrl,
      `(async () => {
        const container = window.__testContainer;
        container.innerHTML = "";

        await window.ModDetailModule.renderModDetail(container, {
          modId: "effort-optimizer",
          sourceTab: "marketplace",
          bridge: window.__mockBridge,
          onBack: () => {},
          onRefresh: () => {},
        });

        const footer = container.querySelector('[data-testid="plugin-detail-footer"]');
        const versionDd = container.querySelector('[data-testid="plugin-detail-footer-version"]');

        return {
          hasFooter: footer !== null,
          versionText: versionDd ? versionDd.textContent || "" : "",
        };
      })()`,
    );

    assert.equal(result.hasFooter, true, "Footer must exist");
    assert.equal(result.versionText, "1.0.0");
  });

  it("renders toggle switch and folder button for installed mod in real DOM", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome executable not found; skipping");
      return;
    }

    const result = await evalInPage<{
      hasToggle: boolean;
      toggleChecked: string | null;
      hasOpenFolder: boolean;
    }>(
      wsUrl,
      `(async () => {
        const container = window.__testContainer;
        container.innerHTML = "";

        await window.ModDetailModule.renderModDetail(container, {
          modId: "effort-optimizer",
          sourceTab: "installed",
          bridge: window.__mockBridge,
          onBack: () => {},
          onRefresh: () => {},
        });

        const toggle = container.querySelector('[role="switch"]');
        const openFolder = container.querySelector('[data-testid="plugin-detail-open-folder"]');

        return {
          hasToggle: toggle !== null,
          toggleChecked: toggle?.getAttribute("aria-checked") ?? null,
          hasOpenFolder: openFolder !== null,
        };
      })()`,
    );

    assert.equal(result.hasToggle, true, "Toggle switch should be present for installed mod");
    assert.equal(result.toggleChecked, "true");
    assert.equal(result.hasOpenFolder, true, "Open Folder button should be present");
  });

  it("renders Add button for uninstalled mod in real DOM", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome executable not found; skipping");
      return;
    }

    const result = await evalInPage<{
      hasAddBtn: boolean;
    }>(
      wsUrl,
      `(async () => {
        const container = window.__testContainer;
        container.innerHTML = "";

        await window.ModDetailModule.renderModDetail(container, {
          modId: "stream-accel",
          sourceTab: "marketplace",
          bridge: window.__mockBridge,
          onBack: () => {},
          onRefresh: () => {},
        });

        const buttons = Array.from(container.querySelectorAll("button"));
        const addBtn = buttons.find((b) => b.textContent?.trim() === "Add");

        return {
          hasAddBtn: addBtn !== undefined,
        };
      })()`,
    );

    assert.equal(result.hasAddBtn, true, "Add button should be present for uninstalled mod");
  });

  it("interacts with Marketplace and Installed tabs in full Mods View overlay", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome executable not found; skipping");
      return;
    }

    const result = await evalInPage<{
      modsViewOpen: boolean;
      hasMarketplaceView: boolean;
      hasTabBrowse: boolean;
      hasTabInstalled: boolean;
      browseHasActiveClass: boolean;
      installedHasActiveClass: boolean;
      hasCustomizationCards: boolean;
      cardCount: number;
    }>(
      wsUrl,
      `(async () => {
        // Open Mods View overlay
        window.AGYBoost.ui.openModsView();
        await new Promise(r => setTimeout(r, 60));

        const browseTab = document.querySelector('[data-testid="plugins-tab-browse"]');
        const installedTab = document.querySelector('[data-testid="plugins-tab-installed"]');
        const marketplaceView = document.querySelector('[data-testid="customizations-marketplace"]');
        const cards = document.querySelectorAll('[data-testid="customization-card"]');

        const browseHasActiveClass = browseTab?.classList.contains("active") || browseTab?.classList.contains("bg-secondary") || false;

        // Click Installed tab
        if (installedTab) {
          installedTab.click();
        }
        await new Promise(r => setTimeout(r, 60));

        const installedBtnNow = document.querySelector('[data-testid="plugins-tab-installed"]');
        const installedHasActiveClass = installedBtnNow?.classList.contains("active") || installedBtnNow?.classList.contains("bg-secondary") || false;

        // Switch back to Browse / Marketplace
        const browseBtnNow = document.querySelector('[data-testid="plugins-tab-browse"]');
        if (browseBtnNow) {
          browseBtnNow.click();
        }
        await new Promise(r => setTimeout(r, 60));

        return {
          modsViewOpen: window.AGYBoost.ui.isModsViewOpen(),
          hasMarketplaceView: marketplaceView !== null,
          hasTabBrowse: browseTab !== null,
          hasTabInstalled: installedTab !== null,
          browseHasActiveClass,
          installedHasActiveClass,
          hasCustomizationCards: cards.length > 0,
          cardCount: cards.length,
        };
      })()`,
    );

    assert.equal(result.modsViewOpen, true, "Mods view overlay should be open");
    assert.equal(result.hasMarketplaceView, true, "Marketplace view should be visible");
    assert.equal(result.hasTabBrowse, true, "Browse tab should exist");
    assert.equal(result.hasTabInstalled, true, "Installed tab should exist");
    assert.equal(
      result.browseHasActiveClass,
      true,
      "Browse tab should have active class initially",
    );
    assert.equal(
      result.installedHasActiveClass,
      true,
      "Installed tab should have active class after click",
    );
    assert.equal(result.hasCustomizationCards, true);
    assert.ok(result.cardCount > 0, "Marketplace should display catalog cards");

    // Close Mods View and verify clean restoration
    await evalInPage(
      wsUrl,
      `(() => {
        window.AGYBoost.ui.closeModsView();
      })()`,
    );
    await delay(60);
  });

  it("strictly preserves flexbox invariant on conversation-view throughout interactions", async (t) => {
    if (!CHROME_PATH || !wsUrl) {
      t.skip("Chrome executable not found; skipping");
      return;
    }

    const flex = await evalInPage<{
      inlineDisplay: string;
      computedFlex: string;
      child0Height: number;
      child1Height: number;
    }>(
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
