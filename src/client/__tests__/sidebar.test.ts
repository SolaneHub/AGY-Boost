import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupMockDOM } from "./mock-dom.js";
import {
  setNavItemActive,
  setNavItemInactive,
  setNewChatActive,
  setNewChatInactive,
  updateSidebarActiveState,
} from "../ui/sidebar.js";
import { el } from "../ui/dom.js";

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
      document.body.childNodes[0].remove();
    }
  });

  test("setNavItemActive adds active classes and removes inactive/hover classes", () => {
    const item = el("button", {
      class: "bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground",
    });

    setNavItemActive(item);

    assert.ok(item.classList.contains("bg-sidebar-secondary"));
    assert.ok(item.classList.contains("text-foreground"));
    assert.ok(!item.classList.contains("bg-transparent"));
    assert.ok(!item.classList.contains("text-secondary-foreground"));
    assert.ok(!item.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!item.classList.contains("hover:text-foreground"));
  });

  test("setNavItemInactive adds inactive and hover classes and removes active classes", () => {
    const item = el("button", {
      class: "bg-sidebar-secondary text-foreground",
    });

    setNavItemInactive(item);

    assert.ok(!item.classList.contains("bg-sidebar-secondary"));
    assert.ok(item.classList.contains("bg-transparent"));
    assert.ok(item.classList.contains("text-secondary-foreground"));
    assert.ok(item.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(item.classList.contains("hover:text-foreground"));
  });

  test("setNewChatActive and setNewChatInactive toggle New Conversation classes correctly", () => {
    const item = el("a", {
      class: "border border-border text-foreground bg-sidebar-muted hover:bg-sidebar-secondary",
    });

    setNewChatActive(item);
    assert.ok(item.classList.contains("bg-sidebar-secondary"));
    assert.ok(!item.classList.contains("bg-sidebar-muted"));
    assert.ok(!item.classList.contains("hover:bg-sidebar-secondary"));

    setNewChatInactive(item);
    assert.ok(!item.classList.contains("bg-sidebar-secondary"));
    assert.ok(item.classList.contains("bg-sidebar-muted"));
    assert.ok(item.classList.contains("hover:bg-sidebar-secondary"));
  });

  test("updateSidebarActiveState switches active and inactive states between Mods, Customizations, Automations, and New Conversation", () => {
    const navItems = el("div", { "data-testid": "sidebar-navigation-items" });
    const newChatBtn = el("a", {
      "data-testid": "new-conversation-button",
      class: "border border-border text-foreground bg-sidebar-secondary",
    }, ["New Conversation"]);
    const autoBtn = el("button", {
      "data-testid": "automations-button",
      class: "bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground",
    }, ["Automations"]);
    const custBtn = el("button", {
      class: "bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground",
    }, ["Customizations"]);
    const modsBtn = el("button", {
      "data-agy-boost-mods-btn": "true",
      class: "bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground",
    }, ["Mods"]);

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

    // 6. User closes Mods via toggle (no target) while on /
    (globalThis as any).window.location = { pathname: "/" };
    updateSidebarActiveState(false);
    assert.ok(newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(modsBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));

    // 7. User closes Mods via toggle (no target) while on /customizations
    (globalThis as any).window.location = { pathname: "/customizations" };
    updateSidebarActiveState(false);
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(modsBtn.classList.contains("hover:bg-sidebar-muted"));
    assert.ok(custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("hover:bg-sidebar-muted"));

    // 8. User closes Mods via toggle while on /sidecars
    (globalThis as any).window.location = { pathname: "/sidecars" };
    updateSidebarActiveState(false);
    assert.ok(!newChatBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(newChatBtn.classList.contains("hover:bg-sidebar-secondary"));
    assert.ok(!modsBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(autoBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(!custBtn.classList.contains("bg-sidebar-secondary"));
    assert.ok(custBtn.classList.contains("hover:bg-sidebar-muted"));

    // 9. User closes Mods via toggle while in conversation /c/test
    (globalThis as any).window.location = { pathname: "/c/123" };
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
