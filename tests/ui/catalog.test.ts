import { test as it, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MARKETPLACE_CATALOG,
  getMarketplaceMod,
  type MarketplaceMod,
} from "../../src/client/ui/marketplace/catalog.js";

describe("Marketplace Catalog (MARKETPLACE_CATALOG)", () => {
  const ValidCategories = new Set<MarketplaceMod["category"]>(["compute", "theme", "sidecar"]);

  it("contains valid items in the catalog", () => {
    assert.ok(Array.isArray(MARKETPLACE_CATALOG));
    assert.ok(MARKETPLACE_CATALOG.length > 0);
  });

  it("all catalog entries have unique IDs and valid categories", () => {
    const seenIds = new Set<string>();
    for (const mod of MARKETPLACE_CATALOG) {
      assert.ok(mod.id && mod.id.trim().length > 0, "Mod ID must be non-empty");
      assert.equal(seenIds.has(mod.id), false, `Duplicate mod ID: "${mod.id}"`);
      seenIds.add(mod.id);
      assert.ok(ValidCategories.has(mod.category), `Invalid category on "${mod.id}"`);
    }
  });

  it("getMarketplaceMod retrieves mod by id", () => {
    const mod = getMarketplaceMod("effort-optimizer");
    assert.ok(mod !== undefined);
    assert.equal(mod?.id, "effort-optimizer");
    assert.ok(typeof mod?.name === "string" && mod.name.length > 0);
  });
});
