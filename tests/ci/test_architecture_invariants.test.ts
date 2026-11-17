import { test as it, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupMockDOM } from "../harness/mock-dom.js";
import { getLayoutDiagnostics } from "../../src/client/ui/slots.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

describe("Architecture & Guardrail Invariants (CI Tests)", () => {
  it("src/client runtime files contain zero console.log/warn/debug calls", () => {
    const clientDir = path.join(rootDir, "src", "client");

    function scanDir(dir: string): string[] {
      const files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "dist" && entry.name !== "node_modules") {
            files.push(...scanDir(fullPath));
          }
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const clientFiles = scanDir(clientDir);
    assert.ok(clientFiles.length > 0, "should find client TypeScript files");

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf8");
      // Strip comments to only check actual code execution
      const noComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/gu, "");
      const hasConsole = /(?<![a-zA-Z0-9_])console\.(log|warn|debug|info)\(/u.test(noComments);
      assert.equal(
        hasConsole,
        false,
        `Found forbidden console statement in runtime file: ${path.relative(rootDir, file)}`,
      );
    }
  });

  it("src/client/index.ts preserves defensive flexbox layout invariant observer", () => {
    const indexPath = path.join(rootDir, "src", "client", "index.ts");
    assert.ok(fs.existsSync(indexPath), "index.ts should exist");
    const content = fs.readFileSync(indexPath, "utf8");
    assert.ok(
      content.includes("enforceConversationLayoutInvariant"),
      "index.ts must contain enforceConversationLayoutInvariant",
    );
    assert.ok(
      content.includes('[data-testid="conversation-view"]'),
      'index.ts must watch [data-testid="conversation-view"]',
    );
  });

  it("critical .gitignore rules include essential build artifacts and system files", () => {
    const gitignorePath = path.join(rootDir, ".gitignore");
    assert.ok(fs.existsSync(gitignorePath), ".gitignore should exist");
    const content = fs.readFileSync(gitignorePath, "utf8");
    const requiredRules = ["node_modules", "dist", "*.exe", ".DS_Store", "coverage"];
    for (const rule of requiredRules) {
      assert.ok(content.includes(rule), `.gitignore must contain essential rule '${rule}'`);
    }
  });

  it("AGYBoost.ui.getLayoutDiagnostics API export invariant", () => {
    const slotsPath = path.join(rootDir, "src", "client", "ui", "slots.ts");
    const indexPath = path.join(rootDir, "src", "client", "index.ts");
    const slotsContent = fs.readFileSync(slotsPath, "utf8");
    const indexContent = fs.readFileSync(indexPath, "utf8");

    assert.ok(
      slotsContent.includes("export function getLayoutDiagnostics"),
      "src/client/ui/slots.ts must export getLayoutDiagnostics",
    );
    assert.ok(
      indexContent.includes("getLayoutDiagnostics"),
      "src/client/index.ts must expose getLayoutDiagnostics under AGYBoost.ui",
    );
  });

  describe("Layout Diagnostics Behavioral Invariants", () => {
    let cleanupDom: () => void;

    beforeEach(() => {
      cleanupDom = setupMockDOM();
    });

    afterEach(() => {
      cleanupDom?.();
    });

    it("State 1: returns non-clean diagnostic snapshot when conversation view is absent", () => {
      const diag = getLayoutDiagnostics();
      assert.equal(diag.conversationViewPresent, false);
      assert.equal(diag.inlineDisplay, "");
      assert.equal(diag.computedFlex, "");
      assert.equal(diag.child0Height, 0);
      assert.equal(diag.child1Height, 0);
      assert.equal(diag.isClean, false);
      assert.equal(Object.isFrozen(diag), true);
    });

    it("State 2: returns clean diagnostic snapshot for healthy conversation view flexbox", () => {
      const doc = (
        globalThis as unknown as { document: import("../harness/mock-dom.js").MockDocument }
      ).document;
      const conv = doc.createElement("div");
      conv.setAttribute("data-testid", "conversation-view");
      conv.classList.add("flex", "flex-col", "h-full", "w-full");

      const child0 = doc.createElement("div");
      child0.clientHeight = 720;
      const child1 = doc.createElement("div");
      child1.clientHeight = 80;

      conv.appendChild(child0);
      conv.appendChild(child1);
      doc.body.appendChild(conv);

      const diag = getLayoutDiagnostics();
      assert.equal(diag.conversationViewPresent, true);
      assert.equal(diag.inlineDisplay, "");
      assert.equal(diag.computedFlex, "flex");
      assert.equal(diag.child0Height, 720);
      assert.equal(diag.child1Height, 80);
      assert.equal(diag.isClean, true);
      assert.equal(Object.isFrozen(diag), true);
    });

    it("State 3: returns isClean=false when inline display is corrupted to 'block'", () => {
      const doc = (
        globalThis as unknown as { document: import("../harness/mock-dom.js").MockDocument }
      ).document;
      const conv = doc.createElement("div");
      conv.setAttribute("data-testid", "conversation-view");
      conv.classList.add("flex", "flex-col", "h-full", "w-full");
      conv.style.display = "block";

      const child0 = doc.createElement("div");
      child0.clientHeight = 720;
      const child1 = doc.createElement("div");
      child1.clientHeight = 80;

      conv.appendChild(child0);
      conv.appendChild(child1);
      doc.body.appendChild(conv);

      const diag = getLayoutDiagnostics();
      assert.equal(diag.conversationViewPresent, true);
      assert.equal(diag.inlineDisplay, "block");
      assert.equal(diag.isClean, false);
      assert.equal(Object.isFrozen(diag), true);
    });

    it("State 4: returns isClean=false when height collapse occurs (child0=0, child1>0)", () => {
      const doc = (
        globalThis as unknown as { document: import("../harness/mock-dom.js").MockDocument }
      ).document;
      const conv = doc.createElement("div");
      conv.setAttribute("data-testid", "conversation-view");
      conv.classList.add("flex", "flex-col", "h-full", "w-full");

      const child0 = doc.createElement("div");
      child0.clientHeight = 0; // collapsed message scroller
      const child1 = doc.createElement("div");
      child1.clientHeight = 80; // composer visible

      conv.appendChild(child0);
      conv.appendChild(child1);
      doc.body.appendChild(conv);

      const diag = getLayoutDiagnostics();
      assert.equal(diag.conversationViewPresent, true);
      assert.equal(diag.child0Height, 0);
      assert.equal(diag.child1Height, 80);
      assert.equal(diag.isClean, false);
      assert.equal(Object.isFrozen(diag), true);
    });

    it("State 5: immutable return object cannot be mutated", () => {
      const diag = getLayoutDiagnostics();
      assert.equal(Object.isFrozen(diag), true);
      assert.throws(() => {
        (diag as unknown as Record<string, unknown>)["isClean"] = true;
      }, TypeError);
      assert.throws(() => {
        (diag as unknown as Record<string, unknown>)["child0Height"] = 999;
      }, TypeError);
    });

    it("Exposed via AGYBoost.ui.getLayoutDiagnostics()", async () => {
      const { AGYBoost } = await import("../../src/client/index.js");
      assert.equal(typeof AGYBoost.ui.getLayoutDiagnostics, "function");
      const diag = AGYBoost.ui.getLayoutDiagnostics();
      assert.ok(diag !== null && typeof diag === "object");
      assert.equal(typeof diag.conversationViewPresent, "boolean");
      assert.equal(typeof diag.inlineDisplay, "string");
      assert.equal(typeof diag.computedFlex, "string");
      assert.equal(typeof diag.child0Height, "number");
      assert.equal(typeof diag.child1Height, "number");
      assert.equal(typeof diag.isClean, "boolean");
      assert.equal(Object.isFrozen(diag), true);
    });
  });
});
