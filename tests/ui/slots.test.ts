import { test as it, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

import { parseCombo, matchesKeyboardEvent } from "../../src/client/ui/slots.js";

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
const PORT = 9558;
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
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
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
      }, 15_000);
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

describe("Slots & UI Overlay Engine (Headless Chrome CDP)", () => {
  let chromeProc: ChildProcess | null = null;
  let tmpDir = "";
  let wsUrl = "";
  let initialHtmlSnapshot = "";

  before(async () => {
    assert.ok(
      fs.existsSync(DIST_BUNDLE_PATH),
      "dist/agy-boost.js must exist before running slots test. Run 'pnpm build'",
    );

    if (!CHROME_PATH) {
      return;
    }

    tmpDir = await mkdtemp(path.join(os.tmpdir(), "agy-slots-cdp-"));
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

    if (!wsUrl) {
      throw new Error("Failed to connect to Chrome CDP endpoint");
    }

    // Wait for AGYBoost runtime to initialize
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const ready = await evalInPage<boolean>(
          wsUrl,
          `Boolean(document.readyState === "complete" && window.AGYBoost && window.__AGY_BOOST_INITIALIZED__)`,
        );
        if (ready) break;
      } catch {
        // Retry
      }
      await delay(100);
    }

    // Capture clean body innerHTML to restore in beforeEach
    initialHtmlSnapshot = await evalInPage<string>(wsUrl, `document.body.innerHTML`);
  });

  after(async () => {
    if (chromeProc) {
      try {
        chromeProc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  beforeEach(async () => {
    if (!wsUrl || !initialHtmlSnapshot) return;
    // Clean up any remaining overlay containers and restore base DOM snapshot
    await evalInPage(
      wsUrl,
      `(() => {
        const hud = document.getElementById("agy-hud-container");
        if (hud) hud.remove();
        const dock = document.getElementById("agy-header-dock");
        if (dock) dock.remove();
        // Remove any mounted pills or header additions
        document.querySelectorAll("[data-agy-mounted-slot]").forEach(el => el.remove());
        // Verify conversation flexbox invariant
        const conv = document.querySelector('[data-testid="conversation-view"]');
        if (conv && conv.style.display === "block") {
          conv.style.display = "";
        }
      })()`,
    );
  });

  describe("mountFloatingHUD", () => {
    it("creates #agy-hud-container with correct styles and attaches element", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        containerExists: boolean;
        position: string;
        pointerEvents: string;
        zIndex: string;
        badgePointerEvents: string;
        containerContainsBadge: boolean;
        defaultSlotContainsBadge: boolean;
        cleanedAfterUnmount: boolean;
        idempotentClean: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountFloatingHUD } = window.AGYBoost.ui;
          const badge = el("div", { class: "my-badge" }, ["HUD Item"]);
          const unmount = mountFloatingHUD(badge);

          const container = document.getElementById("agy-hud-container");
          const containerExists = Boolean(container);
          const position = container?.style.position || "";
          const pointerEvents = container?.style.pointerEvents || "";
          const zIndex = container?.style.zIndex || "";
          const badgePointerEvents = badge.style.pointerEvents;
          const containerContainsBadge = Boolean(container && container.contains(badge));

          const defaultSlot = container?.querySelector('[data-hud-position="top-right"]');
          const defaultSlotContainsBadge = Boolean(defaultSlot && defaultSlot.contains(badge));

          unmount();
          const cleanedAfterUnmount = document.getElementById("agy-hud-container") === null;

          // Idempotency: multiple unmount calls do not throw
          unmount();
          const idempotentClean = document.getElementById("agy-hud-container") === null;

          return {
            containerExists,
            position,
            pointerEvents,
            zIndex,
            badgePointerEvents,
            containerContainsBadge,
            defaultSlotContainsBadge,
            cleanedAfterUnmount,
            idempotentClean,
          };
        })()`,
      );

      assert.equal(res.containerExists, true, "Container #agy-hud-container should be created");
      assert.equal(res.position, "fixed");
      assert.equal(res.pointerEvents, "none");
      assert.equal(res.zIndex, "9999");
      assert.equal(res.badgePointerEvents, "auto");
      assert.equal(res.containerContainsBadge, true, "Container should contain badge element");
      assert.equal(res.defaultSlotContainsBadge, true, "Should create top-right slot by default");
      assert.equal(res.cleanedAfterUnmount, true, "Container should be removed when empty");
      assert.equal(res.idempotentClean, true);
    });

    it("supports multiple positions: top-left, bottom-right, bottom-left", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        containerExists: boolean;
        slotTlContains: boolean;
        slotBrContains: boolean;
        slotBlContains: boolean;
        afterU1TlRemoved: boolean;
        afterU1BrPresent: boolean;
        afterU1BlPresent: boolean;
        afterAllCleaned: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountFloatingHUD } = window.AGYBoost.ui;
          const tl = el("div", { id: "hud-tl" });
          const br = el("div", { id: "hud-br" });
          const bl = el("div", { id: "hud-bl" });

          const u1 = mountFloatingHUD(tl, { position: "top-left" });
          const u2 = mountFloatingHUD(br, { position: "bottom-right" });
          const u3 = mountFloatingHUD(bl, { position: "bottom-left" });

          const container = document.getElementById("agy-hud-container");
          const slotTl = container?.querySelector('[data-hud-position="top-left"]');
          const slotBr = container?.querySelector('[data-hud-position="bottom-right"]');
          const slotBl = container?.querySelector('[data-hud-position="bottom-left"]');

          const containerExists = Boolean(container);
          const slotTlContains = Boolean(slotTl?.contains(tl));
          const slotBrContains = Boolean(slotBr?.contains(br));
          const slotBlContains = Boolean(slotBl?.contains(bl));

          // Unmount top-left only
          u1();
          const afterU1TlRemoved = container?.querySelector('[data-hud-position="top-left"]') === null;
          const afterU1BrPresent = Boolean(container?.querySelector('[data-hud-position="bottom-right"]'));
          const afterU1BlPresent = Boolean(container?.querySelector('[data-hud-position="bottom-left"]'));

          // Unmount remaining
          u2();
          u3();
          const afterAllCleaned = document.getElementById("agy-hud-container") === null;

          return {
            containerExists,
            slotTlContains,
            slotBrContains,
            slotBlContains,
            afterU1TlRemoved,
            afterU1BrPresent,
            afterU1BlPresent,
            afterAllCleaned,
          };
        })()`,
      );

      assert.equal(res.containerExists, true);
      assert.equal(res.slotTlContains, true);
      assert.equal(res.slotBrContains, true);
      assert.equal(res.slotBlContains, true);
      assert.equal(res.afterU1TlRemoved, true);
      assert.equal(res.afterU1BrPresent, true);
      assert.equal(res.afterU1BlPresent, true);
      assert.equal(res.afterAllCleaned, true);
    });

    it("handles multiple elements in the same position and cleans up properly", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        containerExists: boolean;
        slotCountInitial: number;
        slotCountAfterU1: number;
        containerStillExistsAfterU1: boolean;
        cleanedAfterU2: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountFloatingHUD } = window.AGYBoost.ui;
          const item1 = el("div", { id: "item1" });
          const item2 = el("div", { id: "item2" });

          const u1 = mountFloatingHUD(item1, { position: "top-right" });
          const u2 = mountFloatingHUD(item2, { position: "top-right" });

          const container = document.getElementById("agy-hud-container");
          const slot = container?.querySelector('[data-hud-position="top-right"]');
          const slotCountInitial = slot ? slot.childNodes.length : 0;

          u1();
          const slotCountAfterU1 = slot ? slot.childNodes.length : 0;
          const containerStillExistsAfterU1 = Boolean(document.getElementById("agy-hud-container"));

          u2();
          const cleanedAfterU2 = document.getElementById("agy-hud-container") === null;

          return {
            containerExists: Boolean(container),
            slotCountInitial,
            slotCountAfterU1,
            containerStillExistsAfterU1,
            cleanedAfterU2,
          };
        })()`,
      );

      assert.equal(res.containerExists, true);
      assert.equal(res.slotCountInitial, 2);
      assert.equal(res.slotCountAfterU1, 1);
      assert.equal(res.containerStillExistsAfterU1, true);
      assert.equal(res.cleanedAfterU2, true);
    });
  });

  describe("mountHeader", () => {
    it("mounts into header toolbar if [data-testid='pane-titlebar-toolbar'] exists", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        toolbarExists: boolean;
        buttonMounted: boolean;
        buttonRemovedAfterUnmount: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountHeader } = window.AGYBoost.ui;
          const toolbar = document.querySelector('[data-testid="pane-titlebar-toolbar"]');
          const button = el("button", { id: "header-action" }, ["Test Action"]);
          const unmount = mountHeader(button);

          const buttonMounted = Boolean(toolbar && toolbar.contains(button));
          unmount();
          const buttonRemovedAfterUnmount = Boolean(toolbar && !toolbar.contains(button));
          unmount(); // Idempotency check

          return {
            toolbarExists: Boolean(toolbar),
            buttonMounted,
            buttonRemovedAfterUnmount,
          };
        })()`,
      );

      assert.equal(res.toolbarExists, true);
      assert.equal(res.buttonMounted, true, "Button should be mounted in toolbar");
      assert.equal(res.buttonRemovedAfterUnmount, true, "Button should be unmounted");
    });

    it("mounts into header element if no toolbar present", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        statusInsideHeader: boolean;
        statusRemovedAfterUnmount: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountHeader } = window.AGYBoost.ui;
          const toolbar = document.querySelector('[data-testid="pane-titlebar-toolbar"]');
          const header = document.querySelector('[data-main-content-header="true"]');
          let savedToolbarParent = null;
          let nextSibling = null;

          if (toolbar && toolbar.parentElement) {
            savedToolbarParent = toolbar.parentElement;
            nextSibling = toolbar.nextSibling;
            toolbar.remove();
          }

          const status = el("span", { id: "status-indicator" }, ["Online"]);
          const unmount = mountHeader(status);

          const statusInsideHeader = Boolean(header && header.contains(status));
          unmount();
          const statusRemovedAfterUnmount = Boolean(header && !header.contains(status));

          // Restore toolbar
          if (toolbar && savedToolbarParent) {
            savedToolbarParent.insertBefore(toolbar, nextSibling);
          }

          return { statusInsideHeader, statusRemovedAfterUnmount };
        })()`,
      );

      assert.equal(res.statusInsideHeader, true, "Status should be inside header");
      assert.equal(res.statusRemovedAfterUnmount, true);
    });

    it("mounts top-docked bar above mainBody when no header exists, preserving conversation view layout", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        dockCreated: boolean;
        dockContainsItem: boolean;
        dockParentIsMain: boolean;
        convViewDisplayNotBlock: boolean;
        dockRemovedAfterUnmount: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountHeader } = window.AGYBoost.ui;
          const header = document.querySelector('[data-main-content-header="true"]');
          const main = document.querySelector('main');
          const mainBody = document.querySelector('[data-main-content-body="true"]');
          const convView = document.querySelector('[data-testid="conversation-view"]');

          let savedHeaderParent = null;
          let savedNextSibling = null;
          if (header && header.parentElement) {
            savedHeaderParent = header.parentElement;
            savedNextSibling = header.nextSibling;
            header.remove();
          }

          const dockItem = el("div", { id: "dock-item" }, ["Dock Content"]);
          const unmount = mountHeader(dockItem);

          const dock = document.getElementById("agy-header-dock");
          const dockCreated = Boolean(dock);
          const dockContainsItem = Boolean(dock && dock.contains(dockItem));
          const dockParentIsMain = Boolean(dock && dock.parentElement === main);
          const convViewDisplayNotBlock = convView ? convView.style.getPropertyValue("display") !== "block" : false;

          unmount();
          const dockRemovedAfterUnmount = document.getElementById("agy-header-dock") === null;

          // Restore header
          if (header && savedHeaderParent) {
            savedHeaderParent.insertBefore(header, savedNextSibling);
          }

          return {
            dockCreated,
            dockContainsItem,
            dockParentIsMain,
            convViewDisplayNotBlock,
            dockRemovedAfterUnmount,
          };
        })()`,
      );

      assert.equal(res.dockCreated, true, "Dock container should be created");
      assert.equal(res.dockContainsItem, true);
      assert.equal(res.dockParentIsMain, true, "Dock should be placed in main above mainBody");
      assert.equal(
        res.convViewDisplayNotBlock,
        true,
        "conversation-view must never have display: block",
      );
      assert.equal(res.dockRemovedAfterUnmount, true, "Empty dock should be removed");
    });

    it("dynamically promotes element from fallback dock to toolbar when toolbar appears", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        widgetStartedInDock: boolean;
        widgetPromotedToToolbar: boolean;
        emptyDockCleanedUp: boolean;
        unmountedFromToolbar: boolean;
      }>(
        wsUrl,
        `(async () => {
          const { el, mountHeader } = window.AGYBoost.ui;
          const header = document.querySelector('[data-main-content-header="true"]');
          const main = document.querySelector('main');
          const mainBody = document.querySelector('[data-main-content-body="true"]');

          let savedHeaderParent = null;
          let savedNextSibling = null;
          if (header && header.parentElement) {
            savedHeaderParent = header.parentElement;
            savedNextSibling = header.nextSibling;
            header.remove();
          }

          const widget = el("button", { id: "promoted-widget" }, ["Widget"]);
          const unmount = mountHeader(widget);

          const initialDock = document.getElementById("agy-header-dock");
          const widgetStartedInDock = Boolean(initialDock && initialDock.contains(widget));

          // Now header is re-inserted (toolbar appears)
          if (header && main && mainBody) {
            main.insertBefore(header, mainBody);
          }

          // Allow MutationObserver to process the addition
          await new Promise(r => setTimeout(r, 60));

          const toolbar = header?.querySelector('[data-testid="pane-titlebar-toolbar"]');
          const widgetPromotedToToolbar = Boolean(toolbar && toolbar.contains(widget));
          const emptyDockCleanedUp = document.getElementById("agy-header-dock") === null;

          unmount();
          const unmountedFromToolbar = Boolean(toolbar && !toolbar.contains(widget));

          return {
            widgetStartedInDock,
            widgetPromotedToToolbar,
            emptyDockCleanedUp,
            unmountedFromToolbar,
          };
        })()`,
      );

      assert.equal(res.widgetStartedInDock, true, "Widget should start in dock");
      assert.equal(
        res.widgetPromotedToToolbar,
        true,
        "Widget should be automatically promoted to toolbar",
      );
      assert.equal(res.emptyDockCleanedUp, true, "Empty dock should be cleaned up");
      assert.equal(res.unmountedFromToolbar, true);
    });
  });

  describe("mountComposer", () => {
    it("mounts next to model selector trigger container when present", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        mountedNextToModelSelector: boolean;
        mountedSlotAttr: string | null;
        convViewDisplayNotBlock: boolean;
        removedAfterUnmount: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountComposer } = window.AGYBoost.ui;
          const conv = document.querySelector('[data-testid="conversation-view"]');
          const modelBtn = document.querySelector('[data-testid="model-selector-trigger"]');
          const pill = el("button", { id: "test-effort-pill" }, ["⚡ Effort: High"]);
          const unmount = mountComposer(pill);

          const pillParent = pill.parentElement;
          const mountedNextToModelSelector = Boolean(pillParent && modelBtn && pillParent.contains(modelBtn));
          const mountedSlotAttr = pill.getAttribute("data-agy-mounted-slot");
          const convViewDisplayNotBlock = conv ? conv.style.getPropertyValue("display") !== "block" : false;

          unmount();
          const removedAfterUnmount = pill.parentElement === null;
          unmount(); // Idempotency check

          return {
            mountedNextToModelSelector,
            mountedSlotAttr,
            convViewDisplayNotBlock,
            removedAfterUnmount,
          };
        })()`,
      );

      assert.equal(
        res.mountedNextToModelSelector,
        true,
        "Pill should be mounted next to model selector",
      );
      assert.equal(res.mountedSlotAttr, "composer");
      assert.equal(res.convViewDisplayNotBlock, true);
      assert.equal(res.removedAfterUnmount, true, "Pill should be removed after unmount");
    });

    it("mounts next to permissions selector trigger if no model selector present", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        mountedNextToPermTrigger: boolean;
        removedAfterUnmount: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountComposer } = window.AGYBoost.ui;
          const modelBtn = document.querySelector('[data-testid="model-selector-trigger"]');
          const permBtn = document.querySelector('[data-testid="permissions-selector-trigger"]');
          let savedModelParent = null;
          let savedNextSibling = null;

          if (modelBtn && modelBtn.parentElement) {
            savedModelParent = modelBtn.parentElement;
            savedNextSibling = modelBtn.nextSibling;
            modelBtn.remove();
          }

          const pill = el("button", { id: "test-effort-pill-2" });
          const unmount = mountComposer(pill);

          const pillParent = pill.parentElement;
          const mountedNextToPermTrigger = Boolean(pillParent && permBtn && pillParent.contains(permBtn));

          unmount();
          const removedAfterUnmount = pill.parentElement === null;

          // Restore model trigger
          if (modelBtn && savedModelParent) {
            savedModelParent.insertBefore(modelBtn, savedNextSibling);
          }

          return { mountedNextToPermTrigger, removedAfterUnmount };
        })()`,
      );

      assert.equal(res.mountedNextToPermTrigger, true, "Pill should mount into permWrapper");
      assert.equal(res.removedAfterUnmount, true);
    });

    it("mounts into composer root/footer as fallback", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        mountedIntoFallback: boolean;
        removedAfterUnmount: boolean;
      }>(
        wsUrl,
        `(() => {
          const { el, mountComposer } = window.AGYBoost.ui;
          const modelBtn = document.querySelector('[data-testid="model-selector-trigger"]');
          const permBtn = document.querySelector('[data-testid="permissions-selector-trigger"]');
          const composerChild = document.getElementById("child-1-composer");

          let savedModelParent = null;
          let savedModelNext = null;
          if (modelBtn && modelBtn.parentElement) {
            savedModelParent = modelBtn.parentElement;
            savedModelNext = modelBtn.nextSibling;
            modelBtn.remove();
          }

          let savedPermParent = null;
          let savedPermNext = null;
          if (permBtn && permBtn.parentElement) {
            savedPermParent = permBtn.parentElement;
            savedPermNext = permBtn.nextSibling;
            permBtn.remove();
          }

          const pill = el("button", { id: "test-effort-pill-3" });
          const unmount = mountComposer(pill);

          const mountedIntoFallback = Boolean(composerChild && composerChild.contains(pill));

          unmount();
          const removedAfterUnmount = pill.parentElement === null;

          // Restore triggers
          if (permBtn && savedPermParent) {
            savedPermParent.insertBefore(permBtn, savedPermNext);
          }
          if (modelBtn && savedModelParent) {
            savedModelParent.insertBefore(modelBtn, savedModelNext);
          }

          return { mountedIntoFallback, removedAfterUnmount };
        })()`,
      );

      assert.equal(
        res.mountedIntoFallback,
        true,
        "Pill should mount into composer wrapper fallback",
      );
      assert.equal(res.removedAfterUnmount, true);
    });
  });

  describe("registerShortcut", () => {
    it("registers shortcut and triggers handler with platform-normalized modifier in browser", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        matchCount: number;
        noShiftCount: number;
        diffKeyCount: number;
        afterUnregisterCount: number;
      }>(
        wsUrl,
        `(() => {
          const { registerShortcut } = window.AGYBoost.ui;
          let triggered = 0;
          const unregister = registerShortcut("Cmd+Shift+M", () => {
            triggered++;
          });

          const isMac = /mac/iu.test(navigator.userAgent || navigator.platform || "");
          const matchEvt = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            metaKey: isMac,
            ctrlKey: !isMac,
            shiftKey: true,
            altKey: false,
            key: "m",
            code: "KeyM",
          });

          window.dispatchEvent(matchEvt);
          const matchCount = triggered;

          // Non-matching event (missing Shift)
          window.dispatchEvent(new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            metaKey: isMac,
            ctrlKey: !isMac,
            shiftKey: false,
            altKey: false,
            key: "m",
          }));
          const noShiftCount = triggered;

          // Non-matching event (different key)
          window.dispatchEvent(new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            metaKey: isMac,
            ctrlKey: !isMac,
            shiftKey: true,
            altKey: false,
            key: "k",
          }));
          const diffKeyCount = triggered;

          // Unregister and verify no more events trigger
          unregister();
          window.dispatchEvent(matchEvt);
          const afterUnregisterCount = triggered;
          unregister(); // Idempotency check

          return { matchCount, noShiftCount, diffKeyCount, afterUnregisterCount };
        })()`,
      );

      assert.equal(res.matchCount, 1);
      assert.equal(res.noShiftCount, 1, "Should not trigger without Shift");
      assert.equal(res.diffKeyCount, 1, "Should not trigger on key k");
      assert.equal(res.afterUnregisterCount, 1, "Should not trigger after unregistering");
    });

    it("handles Ctrl and Alt shortcuts", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        altCountAfterAlt: number;
        ctrlCountAfterAlt: number;
        altCountAfterCtrl: number;
        ctrlCountAfterCtrl: number;
      }>(
        wsUrl,
        `(() => {
          const { registerShortcut } = window.AGYBoost.ui;
          let altCount = 0;
          let ctrlCount = 0;

          const uAlt = registerShortcut("Alt+T", () => {
            altCount++;
          });
          const uCtrl = registerShortcut("Ctrl+Shift+P", () => {
            ctrlCount++;
          });

          window.dispatchEvent(new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            altKey: true,
            ctrlKey: false,
            metaKey: false,
            shiftKey: false,
            key: "t",
          }));
          const altCountAfterAlt = altCount;
          const ctrlCountAfterAlt = ctrlCount;

          window.dispatchEvent(new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            shiftKey: true,
            metaKey: false,
            altKey: false,
            key: "p",
          }));
          const altCountAfterCtrl = altCount;
          const ctrlCountAfterCtrl = ctrlCount;

          uAlt();
          uCtrl();

          return { altCountAfterAlt, ctrlCountAfterAlt, altCountAfterCtrl, ctrlCountAfterCtrl };
        })()`,
      );

      assert.equal(res.altCountAfterAlt, 1);
      assert.equal(res.ctrlCountAfterAlt, 0);
      assert.equal(res.altCountAfterCtrl, 1);
      assert.equal(res.ctrlCountAfterCtrl, 1);
    });

    it("handles special keys: plus (++), space, esc, enter, arrow keys", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        plusCount: number;
        spaceCount: number;
        escCount: number;
        upCount: number;
      }>(
        wsUrl,
        `(() => {
          const { registerShortcut } = window.AGYBoost.ui;
          let plusCount = 0;
          let spaceCount = 0;
          let escCount = 0;
          let upCount = 0;

          const uPlus = registerShortcut("Ctrl++", () => {
            plusCount++;
          });
          const uSpace = registerShortcut("Alt+Space", () => {
            spaceCount++;
          });
          const uEsc = registerShortcut("Ctrl+Esc", () => {
            escCount++;
          });
          const uUp = registerShortcut("Ctrl+Up", () => {
            upCount++;
          });

          window.dispatchEvent(new KeyboardEvent("keydown", {
            bubbles: true,
            ctrlKey: true,
            shiftKey: false,
            metaKey: false,
            altKey: false,
            key: "+",
            code: "Equal",
          }));

          window.dispatchEvent(new KeyboardEvent("keydown", {
            bubbles: true,
            altKey: true,
            ctrlKey: false,
            metaKey: false,
            shiftKey: false,
            key: " ",
            code: "Space",
          }));

          window.dispatchEvent(new KeyboardEvent("keydown", {
            bubbles: true,
            ctrlKey: true,
            shiftKey: false,
            metaKey: false,
            altKey: false,
            key: "Escape",
            code: "Escape",
          }));

          window.dispatchEvent(new KeyboardEvent("keydown", {
            bubbles: true,
            ctrlKey: true,
            shiftKey: false,
            metaKey: false,
            altKey: false,
            key: "ArrowUp",
            code: "ArrowUp",
          }));

          uPlus();
          uSpace();
          uEsc();
          uUp();

          return { plusCount, spaceCount, escCount, upCount };
        })()`,
      );

      assert.equal(res.plusCount, 1, "Ctrl++ should match plus key");
      assert.equal(res.spaceCount, 1, "Alt+Space should match spacebar");
      assert.equal(res.escCount, 1, "Ctrl+Esc should match Escape");
      assert.equal(res.upCount, 1, "Ctrl+Up should match ArrowUp");
    });

    it("parseCombo and matchesKeyboardEvent unit tests", () => {
      const macParsed = parseCombo("Cmd+Shift+K", true);
      assert.equal(macParsed.meta, true);
      assert.equal(macParsed.ctrl, false);
      assert.equal(macParsed.shift, true);
      assert.equal(macParsed.key, "k");

      const winParsed = parseCombo("Cmd+Shift+K", false);
      assert.equal(winParsed.meta, false);
      assert.equal(winParsed.ctrl, true);
      assert.equal(winParsed.shift, true);
      assert.equal(winParsed.key, "k");

      // Empty key returns false
      assert.equal(
        matchesKeyboardEvent(
          {
            type: "keydown",
            metaKey: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            key: "",
          } as unknown as KeyboardEvent,
          { ctrl: false, meta: true, shift: false, alt: false, key: "" },
        ),
        false,
      );
    });
  });

  describe("observeConversation", () => {
    it("observes new elements appended to conversation-view and ignores composer", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        observedCount: number;
        observedClass: string;
        countAfterComposer: number;
        countAfterDisconnect: number;
      }>(
        wsUrl,
        `(async () => {
          const { el, observeConversation } = window.AGYBoost.ui;
          const messagesContainer = document.getElementById("child-0-messages");
          const conv = document.querySelector('[data-testid="conversation-view"]');

          const observedNodes = [];
          const disconnect = observeConversation((node) => {
            observedNodes.push(node);
          });

          const newMsg = el("div", { class: "message" }, ["New message text"]);
          messagesContainer.appendChild(newMsg);
          await new Promise(r => setTimeout(r, 60));

          const observedCount = observedNodes.length;
          const observedClass = observedNodes[0]?.className || "";

          // Composer element should be ignored
          const composer = el("div", { id: "child-1-composer", class: "composer-test" });
          conv.appendChild(composer);
          await new Promise(r => setTimeout(r, 60));
          const countAfterComposer = observedNodes.length;
          composer.remove();

          disconnect();

          const anotherMsg = el("div", { class: "message-2" });
          messagesContainer.appendChild(anotherMsg);
          await new Promise(r => setTimeout(r, 60));
          const countAfterDisconnect = observedNodes.length;

          newMsg.remove();
          anotherMsg.remove();
          disconnect(); // Idempotency check

          return { observedCount, observedClass, countAfterComposer, countAfterDisconnect };
        })()`,
      );

      assert.equal(res.observedCount, 1);
      assert.equal(res.observedClass, "message");
      assert.equal(res.countAfterComposer, 1, "Composer must be ignored");
      assert.equal(res.countAfterDisconnect, 1, "Should not trigger after disconnect");
    });

    it("resubscribes when conversation-view is replaced on route switch", async (t) => {
      if (!wsUrl) {
        t.skip("Chrome not available; skipping");
        return;
      }

      const res = await evalInPage<{
        observedCount1: number;
        observedCount2: number;
        observedId2: string;
      }>(
        wsUrl,
        `(async () => {
          const { el, observeConversation } = window.AGYBoost.ui;
          const conv1 = document.querySelector('[data-testid="conversation-view"]');
          const convParent = conv1?.parentElement;

          const observedNodes = [];
          const disconnect = observeConversation((node) => {
            observedNodes.push(node);
          });

          // 1. Initial message in conv1
          const msg1 = el("div", { id: "conv1-msg" });
          conv1.appendChild(msg1);
          await new Promise(r => setTimeout(r, 60));
          const observedCount1 = observedNodes.length;

          // 2. Switch conversation (replace conv1 with conv2)
          conv1.remove();
          const conv2 = el("div", {
            "data-testid": "conversation-view",
            class: "flex flex-col h-full w-full",
          });
          convParent.appendChild(conv2);
          await new Promise(r => setTimeout(r, 60));

          // 3. New message arrives in conv2
          const msg2 = el("div", { id: "conv2-msg" });
          conv2.appendChild(msg2);
          await new Promise(r => setTimeout(r, 60));
          const observedCount2 = observedNodes.length;
          const observedId2 = observedNodes[1]?.id || "";

          disconnect();

          // Restore conv1
          conv2.remove();
          convParent.appendChild(conv1);
          msg1.remove();

          return { observedCount1, observedCount2, observedId2 };
        })()`,
      );

      assert.equal(res.observedCount1, 1);
      assert.equal(
        res.observedCount2,
        2,
        "Should observe messages in new conversation view after switch",
      );
      assert.equal(res.observedId2, "conv2-msg");
    });
  });
});
