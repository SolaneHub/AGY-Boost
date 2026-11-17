import { test as it, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupMockDOM } from "../harness/mock-dom.js";
import { updateSidebarActiveState } from "../../src/client/ui/sidebar.js";
import { el } from "../../src/client/ui/dom.js";

describe("Sidebar Navigation & Active State Manager", () => {
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

  it("updateSidebarActiveState switches active and inactive states between Mods, Customizations, Automations, and New Conversation", () => {
    const navItems = el("div", { "data-testid": "sidebar-navigation-items" });
    const newChatBtn = el(
      "a",
      {
        "data-testid": "new-conversation-button",
        class: "border border-border text-foreground bg-sidebar-secondary",
      },
      ["New Conversation"],
    );
    const autoBtn = el(
      "button",
      {
        "data-testid": "automations-button",
        class:
          "bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground",
      },
      ["Automations"],
    );
    const custBtn = el(
      "button",
      {
        class:
          "bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground",
      },
      ["Customizations"],
    );
    const modsBtn = el(
      "button",
      {
        "data-agy-boost-mods-btn": "true",
        class:
          "bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground",
      },
      ["Mods"],
    );

    navItems.appendChild(newChatBtn);
    navItems.appendChild(autoBtn);
    navItems.appendChild(custBtn);
    navItems.appendChild(modsBtn);
    document.body.appendChild(navItems);

    // 1. Activate Mods: New Conversation must become inactive (with hover!), Mods active
    updateSidebarActiveState(true);
    assert.ok(modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("bg-sidebar-muted"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));

    // 2. User clicks Customizations
    updateSidebarActiveState(false, custBtn);
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(modsBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));

    // 3. User clicks Automations
    updateSidebarActiveState(false, autoBtn);
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(modsBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("bg-sidebar-secondary"));

    // 4. User clicks New Conversation
    updateSidebarActiveState(false, newChatBtn);
    assert.ok(newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-muted"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(modsBtn.classList.contains("hover:bg-sidebar-muted"));

    // 5. User opens Mods again from New Conversation
    updateSidebarActiveState(true);
    assert.ok(modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));

    interface GlobalLocationScope {
      window?: {
        location?: {
          pathname?: string;
        };
      };
    }
    const locScope = globalThis as unknown as GlobalLocationScope;

    // 6. User closes Mods via toggle (no target) while on /
    locScope.window = { location: { pathname: "/" } };
    updateSidebarActiveState(false);
    assert.ok(newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(modsBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));

    // 7. User closes Mods via toggle (no target) while on /customizations
    locScope.window = { location: { pathname: "/customizations" } };
    updateSidebarActiveState(false);
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(modsBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));

    // 8. User closes Mods via toggle while on /sidecars
    locScope.window = { location: { pathname: "/sidecars" } };
    updateSidebarActiveState(false);
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));

    // 9. User closes Mods via toggle while in conversation /c/test
    locScope.window = { location: { pathname: "/c/123" } };
    updateSidebarActiveState(false);
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));
  });
});
