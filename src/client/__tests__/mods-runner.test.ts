import { test, describe, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setupMockDOM } from "./mock-dom.js";
import {
  syncModScripts,
  unloadModScript,
  resetModScripts,
  isModScriptActive,
} from "../ui/mods-runner.js";
import { DaemonBridge, ModInfo } from "../bridge/daemon.js";
import { mountHeader, mountComposer } from "../ui/slots.js";

interface TestRunnerGlobals {
  AGYBoost?: {
    version: string;
    wasm: unknown;
    ui: unknown;
  };
  __testModRun?: () => void;
  __testModClean?: () => void;
  __captureContext?: (ctx: unknown) => void;
  __runDefault?: () => void;
  __cleanDefault?: () => void;
  __inc?: () => void;
}

const testGlobals = globalThis as unknown as TestRunnerGlobals;

describe("Mod Script Lifecycle Manager (mods-runner)", () => {
  let teardownDOM: () => void;
  let mockMods: ModInfo[] = [];
  let mockFiles: Record<string, string> = {};

  const createMockBridge = (): DaemonBridge => {
    return {
      getMods: async () => mockMods,
      getModFile: async (id: string, file: string) => {
        const key = `${id}:${file}`;
        return mockFiles[key] ?? null;
      },
    } as unknown as DaemonBridge;
  };

  before(() => {
    teardownDOM = setupMockDOM();
  });

  after(() => {
    teardownDOM();
  });

  beforeEach(() => {
    resetModScripts();
    if (typeof document !== "undefined" && document.body) {
      while (document.body.childNodes.length > 0) {
        document.body.childNodes[0]?.remove();
      }
    }
    mockMods = [];
    mockFiles = {};
    testGlobals.AGYBoost = {
      version: "0.0.0",
      wasm: { test: true },
      ui: { testUI: true },
    };
  });

  afterEach(() => {
    resetModScripts();
    delete testGlobals.AGYBoost;
  });

  test("executes script and registers returned cleanup function", async () => {
    let executed = false;
    let cleanedUp = false;

    mockMods = [
      {
        id: "test-runner-mod",
        name: "Test Runner",
        version: "1.0.0",
        description: "Test",
        enabled: true,
        main: "index.js",
        path: "/dummy",
      },
    ];

    testGlobals.__testModRun = () => {
      executed = true;
    };
    testGlobals.__testModClean = () => {
      cleanedUp = true;
    };

    mockFiles["test-runner-mod:index.js"] = `
      globalThis.__testModRun();
      return () => {
        globalThis.__testModClean();
      };
    `;

    const bridge = createMockBridge();
    await syncModScripts(bridge);

    assert.equal(executed, true, "script should execute");
    assert.equal(isModScriptActive("test-runner-mod"), true);
    assert.equal(cleanedUp, false, "cleanup should not have run yet");

    // Disable mod and sync again
    if (mockMods[0]) mockMods[0].enabled = false;
    await syncModScripts(bridge);

    assert.equal(cleanedUp, true, "cleanup should run on disable");
    assert.equal(isModScriptActive("test-runner-mod"), false);

    delete testGlobals.__testModRun;
    delete testGlobals.__testModClean;
  });

  test("passes context with manifest, wasm, daemon, ui and registers onDispose", async () => {
    interface CapturedContext {
      manifest: { id: string };
      wasm: { test: boolean };
      ui: { testUI: boolean };
      daemon: DaemonBridge;
      onDispose: (fn: () => void) => void;
    }
    let receivedContext: CapturedContext | null = null;
    let disposed = false;

    mockMods = [
      {
        id: "ctx-mod",
        name: "Context Mod",
        version: "2.0.0",
        description: "Context check",
        enabled: true,
        main: "main.js",
        path: "/path/ctx",
      },
    ];

    testGlobals.__captureContext = (ctx: unknown) => {
      receivedContext = ctx as CapturedContext;
      (ctx as CapturedContext).onDispose(() => {
        disposed = true;
      });
    };

    mockFiles["ctx-mod:main.js"] = `
      globalThis.__captureContext(context);
    `;

    const bridge = createMockBridge();
    await syncModScripts(bridge);

    assert.ok(receivedContext, "context should be passed to script");
    const ctx = receivedContext as CapturedContext;
    assert.equal(ctx.manifest.id, "ctx-mod");
    assert.equal(ctx.wasm.test, true);
    assert.equal(ctx.ui.testUI, true);
    assert.equal(ctx.daemon, bridge);
    assert.equal(isModScriptActive("ctx-mod"), true);

    unloadModScript("ctx-mod");
    assert.equal(disposed, true, "onDispose callback should be called on unload");
    assert.equal(isModScriptActive("ctx-mod"), false);

    delete testGlobals.__captureContext;
  });

  test("handles module.exports and export default transformations", async () => {
    let defaultRun = false;
    let defaultClean = false;

    mockMods = [
      {
        id: "es-mod",
        name: "ES Mod",
        version: "1.0.0",
        description: "ES Export",
        enabled: true,
        main: "entry.js",
        path: "/path/es",
      },
    ];

    testGlobals.__runDefault = () => {
      defaultRun = true;
    };
    testGlobals.__cleanDefault = () => {
      defaultClean = true;
    };

    mockFiles["es-mod:entry.js"] = `
      export default function(ctx) {
        globalThis.__runDefault();
        return () => {
          globalThis.__cleanDefault();
        };
      }
    `;

    const bridge = createMockBridge();
    await syncModScripts(bridge);

    assert.equal(defaultRun, true);
    assert.equal(isModScriptActive("es-mod"), true);

    unloadModScript("es-mod");
    assert.equal(defaultClean, true);

    delete testGlobals.__runDefault;
    delete testGlobals.__cleanDefault;
  });

  test("does not re-execute already active scripts on subsequent syncs", async () => {
    let executionCount = 0;

    mockMods = [
      {
        id: "counter-mod",
        name: "Counter Mod",
        version: "1.0.0",
        description: "Counter",
        enabled: true,
        main: "counter.js",
        path: "/path/counter",
      },
    ];

    testGlobals.__inc = () => {
      executionCount++;
    };

    mockFiles["counter-mod:counter.js"] = `
      globalThis.__inc();
    `;

    const bridge = createMockBridge();
    await syncModScripts(bridge);
    assert.equal(executionCount, 1);

    await syncModScripts(bridge);
    assert.equal(executionCount, 1, "should not execute again while still active");

    delete testGlobals.__inc;
  });

  test("safely catches execution errors without throwing", async () => {
    mockMods = [
      {
        id: "buggy-mod",
        name: "Buggy Mod",
        version: "1.0.0",
        description: "Throws",
        enabled: true,
        main: "broken.js",
        path: "/path/broken",
      },
    ];

    mockFiles["buggy-mod:broken.js"] = `
      throw new Error("Deliberate mod error");
    `;

    const bridge = createMockBridge();
    // Should not throw
    await syncModScripts(bridge);
    assert.equal(isModScriptActive("buggy-mod"), false);
  });

  test("runs real effort-optimizer mod: mounts interactive button, toggles levels, and cleans up", async () => {
    // Find mod file path
    const candidatePaths = [
      path.resolve(process.cwd(), "mods/effort-optimizer/index.js"),
      path.resolve(process.cwd(), "../../mods/effort-optimizer/index.js"),
      path.resolve(
        "/Users/veronicalostimolo/Library/Application Support/AGYBoost/mods/effort-optimizer/index.js"
      ),
    ];
    let realScript = "";
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        realScript = fs.readFileSync(p, "utf-8");
        break;
      }
    }
    assert.ok(realScript.length > 0, "effort-optimizer index.js must exist");

    mockMods = [
      {
        id: "effort-optimizer",
        name: "Effort Optimizer",
        version: "1.0.0",
        description: "Reasoning tuner",
        enabled: true,
        main: "index.js",
        path: "/path/effort-optimizer",
      },
    ];
    mockFiles["effort-optimizer:index.js"] = realScript;

    // Setup mock UI with mountHeader and mountComposer
    if (testGlobals.AGYBoost) {
      testGlobals.AGYBoost.ui = {
        mountHeader,
        mountComposer,
      };
    }

    // Setup mock header toolbar in document
    const toolbar = document.createElement("div");
    toolbar.setAttribute("data-testid", "pane-titlebar-toolbar");
    document.body.appendChild(toolbar);

    // Setup mock chat composer with model selector in document
    const conv = document.createElement("div");
    conv.setAttribute("data-testid", "conversation-view");
    const composerBox = document.createElement("div");
    composerBox.setAttribute("data-testid", "agent-input-box");
    const footerRow = document.createElement("div");
    footerRow.className = "flex items-center gap-1 min-w-0";
    const modelWrapper = document.createElement("div");
    modelWrapper.className = "min-w-0 no-focus-agent-input";
    const modelBtn = document.createElement("button");
    modelBtn.setAttribute("data-testid", "model-selector-trigger");
    modelBtn.textContent = "Gemini Flash";
    modelWrapper.appendChild(modelBtn);
    footerRow.appendChild(modelWrapper);
    composerBox.appendChild(footerRow);
    conv.appendChild(composerBox);
    document.body.appendChild(conv);

    const bridge = createMockBridge();
    await syncModScripts(bridge);

    assert.equal(isModScriptActive("effort-optimizer"), true);

    // Verify button is mounted in both chat composer and header
    const buttons = document.querySelectorAll(
      '[data-agy-effort-optimizer="true"]'
    ) as NodeListOf<HTMLButtonElement>;
    assert.ok(buttons.length >= 1, "Effort optimizer button should be mounted in the UI");

    const composerPill = document.querySelector(
      '[data-agy-effort-slot="composer"]'
    ) as HTMLButtonElement | null;
    assert.ok(composerPill, "Composer pill must be mounted inside the chat UI");
    assert.equal(
      composerPill.parentElement,
      footerRow,
      "Composer pill must be attached next to model-selector-trigger"
    );
    assert.ok(composerPill.textContent?.includes("High"), "Default effort level should be High");

    // Click composer pill to toggle to next level
    composerPill.click();
    assert.ok(
      composerPill.textContent?.includes("Max"),
      "Clicking button should toggle to Max (1.0)"
    );

    // Click again to cycle to Low
    composerPill.click();
    assert.ok(
      composerPill.textContent?.includes("Low"),
      "Clicking again should toggle to Low (0.2)"
    );

    // Disable mod and sync again
    if (mockMods[0]) mockMods[0].enabled = false;
    await syncModScripts(bridge);

    assert.equal(isModScriptActive("effort-optimizer"), false);
    const buttonsAfter = document.querySelectorAll('[data-agy-effort-optimizer="true"]');
    assert.equal(
      buttonsAfter.length,
      0,
      "All effort optimizer buttons should be cleanly unmounted when mod is disabled"
    );

    toolbar.remove();
    conv.remove();
  });
});
