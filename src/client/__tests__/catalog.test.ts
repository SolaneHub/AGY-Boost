import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MARKETPLACE_CATALOG, type MarketplaceMod } from "../ui/marketplace/catalog.js";

describe("Marketplace Catalog (MARKETPLACE_CATALOG)", () => {
  const VALID_CATEGORIES = new Set<MarketplaceMod["category"]>(["compute", "theme", "sidecar"]);

  test("contains items in the catalog", () => {
    assert.ok(Array.isArray(MARKETPLACE_CATALOG));
    assert.ok(MARKETPLACE_CATALOG.length > 0);
  });

  test("all catalog entries have unique IDs", () => {
    const seenIds = new Set<string>();
    for (const mod of MARKETPLACE_CATALOG) {
      assert.ok(mod.id, "Mod ID must be defined and non-empty");
      assert.equal(
        seenIds.has(mod.id),
        false,
        `Duplicate mod ID detected: "${mod.id}"`
      );
      seenIds.add(mod.id);
    }
  });

  test("all catalog entries have valid categories ('compute' | 'theme' | 'sidecar')", () => {
    for (const mod of MARKETPLACE_CATALOG) {
      assert.ok(
        VALID_CATEGORIES.has(mod.category),
        `Mod "${mod.id}" has invalid category "${mod.category}"`
      );
    }
  });

  test("all required fields are populated for each entry", () => {
    for (const mod of MARKETPLACE_CATALOG) {
      assert.ok(typeof mod.id === "string" && mod.id.trim().length > 0, `Invalid id on ${JSON.stringify(mod)}`);
      assert.ok(typeof mod.name === "string" && mod.name.trim().length > 0, `Invalid name on ${mod.id}`);
      assert.ok(typeof mod.description === "string" && mod.description.trim().length > 0, `Invalid description on ${mod.id}`);
      assert.ok(Array.isArray(mod.badges) && mod.badges.length > 0, `Badges must be a non-empty array on ${mod.id}`);
      assert.ok(typeof mod.iconBg === "string" && mod.iconBg.trim().length > 0, `Invalid iconBg on ${mod.id}`);
      assert.ok(typeof mod.iconSvg === "string" && mod.iconSvg.includes("<svg"), `Invalid iconSvg on ${mod.id}`);
    }
  });
});
