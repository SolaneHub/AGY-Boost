import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

describe("Architecture & Guardrail Invariants (CI Tests)", () => {
  test("src/client runtime files contain zero console.log/warn/debug calls", () => {
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
      const noComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      const hasConsole = /(?<![a-zA-Z0-9_])console\.(log|warn|debug|info)\(/.test(noComments);
      assert.equal(
        hasConsole,
        false,
        `Found forbidden console statement in runtime file: ${path.relative(rootDir, file)}`
      );
    }
  });

  test("src/client/index.ts preserves defensive flexbox layout invariant observer", () => {
    const indexPath = path.join(rootDir, "src", "client", "index.ts");
    assert.ok(fs.existsSync(indexPath), "index.ts should exist");
    const content = fs.readFileSync(indexPath, "utf8");
    assert.ok(
      content.includes("enforceConversationLayoutInvariant"),
      "index.ts must contain enforceConversationLayoutInvariant"
    );
    assert.ok(
      content.includes('[data-testid="conversation-view"]'),
      'index.ts must watch [data-testid="conversation-view"]'
    );
  });

  test("critical .gitignore rules include essential build artifacts and system files", () => {
    const gitignorePath = path.join(rootDir, ".gitignore");
    assert.ok(fs.existsSync(gitignorePath), ".gitignore should exist");
    const content = fs.readFileSync(gitignorePath, "utf8");
    const requiredRules = ["node_modules", "dist", "*.exe", ".DS_Store", "coverage"];
    for (const rule of requiredRules) {
      assert.ok(content.includes(rule), `.gitignore must contain essential rule '${rule}'`);
    }
  });
});
