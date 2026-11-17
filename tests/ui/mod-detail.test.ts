import { test as it, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupMockDOM } from "../harness/mock-dom.js";
import { el } from "../../src/client/ui/dom.js";
import type { DaemonBridge } from "../../src/client/bridge/daemon.js";
import { renderModDetail } from "../../src/client/ui/marketplace/mod-detail.js";

describe("Mod Detail View (renderModDetail)", () => {
  let teardown: () => void;

  before(() => {
    teardown = setupMockDOM();
  });

  after(() => {
    teardown();
  });

  beforeEach(() => {
    while (document.body.childNodes.length > 0) {
      document.body.childNodes[0]?.remove();
    }
  });

  const mockBridge = {
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
  } as unknown as DaemonBridge;

  it("renders 1:1 plugin detail shell with correct testid and title", async () => {
    const container = el("div");
    document.body.appendChild(container);
    let backCalled = false;

    await renderModDetail(container, {
      modId: "effort-optimizer",
      sourceTab: "marketplace",
      bridge: mockBridge,
      onBack: () => {
        backCalled = true;
      },
      onRefresh: () => {},
    });

    const detailShell = container.querySelector('[data-testid="plugin-detail"]');
    assert.ok(detailShell !== null, "plugin-detail shell must exist");

    const h1 = container.querySelector("h1");
    assert.equal(h1?.textContent, "Effort Optimizer");

    const backBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="plugin-detail-back-button"]',
    );
    assert.ok(backBtn !== null, "Back button must exist");
    backBtn.click();
    assert.equal(backCalled, true, "onBack must be invoked when clicking back");
  });

  it("renders suggested prompts list for catalog mod", async () => {
    const container = el("div");
    document.body.appendChild(container);

    await renderModDetail(container, {
      modId: "effort-optimizer",
      sourceTab: "marketplace",
      bridge: mockBridge,
      onBack: () => {},
      onRefresh: () => {},
    });

    const promptList = container.querySelector('[data-testid="plugin-suggested-prompt-list"]');
    assert.ok(promptList !== null, "Suggested prompts list should be rendered");

    const rows = container.querySelectorAll('[data-testid="plugin-suggested-prompt-row"]');
    assert.ok(rows.length > 0, "Should have at least one suggested prompt row");
  });

  it("renders Overview and Skills tabs and switches panels", async () => {
    const container = el("div");
    document.body.appendChild(container);

    await renderModDetail(container, {
      modId: "effort-optimizer",
      sourceTab: "marketplace",
      bridge: mockBridge,
      onBack: () => {},
      onRefresh: () => {},
    });

    const tabOverview = container.querySelector<HTMLButtonElement>("#plugin-detail-tab-overview");
    const tabSkills = container.querySelector<HTMLButtonElement>("#plugin-detail-tab-skills");
    const tabpanel = container.querySelector("#plugin-detail-tabpanel");

    assert.ok(tabOverview !== null);
    assert.ok(tabSkills !== null);
    assert.ok(tabpanel !== null);

    // Initial is Overview
    assert.equal(tabOverview.getAttribute("aria-selected"), "true");
    assert.equal(tabSkills.getAttribute("aria-selected"), "false");
    assert.ok(
      container.querySelector("[data-markdown-root]") !== null,
      "Readme markdown root should exist in Overview",
    );

    // Click Skills
    tabSkills.click();
    assert.equal(tabSkills.getAttribute("aria-selected"), "true");
    assert.equal(tabOverview.getAttribute("aria-selected"), "false");
  });

  it("renders metadata footer with version and author", async () => {
    const container = el("div");
    document.body.appendChild(container);

    await renderModDetail(container, {
      modId: "effort-optimizer",
      sourceTab: "marketplace",
      bridge: mockBridge,
      onBack: () => {},
      onRefresh: () => {},
    });

    const footer = container.querySelector('[data-testid="plugin-detail-footer"]');
    assert.ok(footer !== null, "Footer must exist");

    const versionDd = container.querySelector('[data-testid="plugin-detail-footer-version"]');
    assert.equal(versionDd?.textContent, "1.0.0");
  });

  it("renders toggle switch and folder button for installed mod", async () => {
    const container = el("div");
    document.body.appendChild(container);

    await renderModDetail(container, {
      modId: "effort-optimizer",
      sourceTab: "installed",
      bridge: mockBridge,
      onBack: () => {},
      onRefresh: () => {},
    });

    const toggle = container.querySelector('[role="switch"]');
    assert.ok(toggle !== null, "Toggle switch should be present for installed mod");
    assert.equal(toggle.getAttribute("aria-checked"), "true");

    const openFolder = container.querySelector('[data-testid="plugin-detail-open-folder"]');
    assert.ok(openFolder !== null, "Open Folder button should be present");
  });

  it("renders Add button for uninstalled mod", async () => {
    const container = el("div");
    document.body.appendChild(container);

    await renderModDetail(container, {
      modId: "stream-accel",
      sourceTab: "marketplace",
      bridge: mockBridge,
      onBack: () => {},
      onRefresh: () => {},
    });

    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Add",
    );
    assert.ok(addBtn !== undefined, "Add button should be present for uninstalled mod");
  });
});
