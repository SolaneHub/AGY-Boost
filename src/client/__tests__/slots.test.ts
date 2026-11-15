import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupMockDOM } from "./mock-dom.js";
import {
  mountFloatingHUD,
  mountHeader,
  mountComposer,
  registerShortcut,
  observeConversation,
  isMac,
  parseCombo,
  matchesKeyboardEvent,
} from "../ui/slots.js";
import { el } from "../ui/dom.js";

describe("Slots & UI Overlay Engine", () => {
  let teardown: () => void;

  before(() => {
    teardown = setupMockDOM();
  });

  after(() => {
    teardown();
  });

  beforeEach(() => {
    // Clear document body between tests
    while (document.body.childNodes.length > 0) {
      document.body.childNodes[0].remove();
    }
  });

  describe("mountFloatingHUD", () => {
    test("creates #agy-hud-container with correct styles and attaches element", () => {
      const badge = el("div", { class: "my-badge" }, ["HUD Item"]);
      const unmount = mountFloatingHUD(badge);

      const container = document.getElementById("agy-hud-container");
      assert.ok(container, "Container #agy-hud-container should be created");
      assert.equal(container.style.position, "fixed");
      assert.equal(container.style.pointerEvents, "none");
      assert.equal(container.style.zIndex, "9999");

      assert.equal(badge.style.pointerEvents, "auto");
      assert.ok(container.contains(badge), "Container should contain badge element");

      // Verify default position is top-right
      const defaultSlot = container.querySelector('[data-hud-position="top-right"]');
      assert.ok(defaultSlot, "Should create top-right slot by default");
      assert.ok(defaultSlot.contains(badge));

      unmount();
      assert.equal(document.getElementById("agy-hud-container"), null, "Container should be removed when empty");
      // Idempotency: multiple unmount calls do not throw
      unmount();
      assert.equal(document.getElementById("agy-hud-container"), null);
    });

    test("supports multiple positions: top-left, bottom-right, bottom-left", () => {
      const tl = el("div", { id: "hud-tl" });
      const br = el("div", { id: "hud-br" });
      const bl = el("div", { id: "hud-bl" });

      const u1 = mountFloatingHUD(tl, { position: "top-left" });
      const u2 = mountFloatingHUD(br, { position: "bottom-right" });
      const u3 = mountFloatingHUD(bl, { position: "bottom-left" });

      const container = document.getElementById("agy-hud-container")!;
      assert.ok(container);

      const slotTL = container.querySelector('[data-hud-position="top-left"]');
      const slotBR = container.querySelector('[data-hud-position="bottom-right"]');
      const slotBL = container.querySelector('[data-hud-position="bottom-left"]');

      assert.ok(slotTL && slotTL.contains(tl));
      assert.ok(slotBR && slotBR.contains(br));
      assert.ok(slotBL && slotBL.contains(bl));

      // Unmount top-left only
      u1();
      assert.equal(container.querySelector('[data-hud-position="top-left"]'), null);
      assert.ok(container.querySelector('[data-hud-position="bottom-right"]'));
      assert.ok(container.querySelector('[data-hud-position="bottom-left"]'));

      // Unmount remaining
      u2();
      u3();
      assert.equal(document.getElementById("agy-hud-container"), null);
    });

    test("handles multiple elements in the same position and cleans up properly", () => {
      const item1 = el("div", { id: "item1" });
      const item2 = el("div", { id: "item2" });

      const u1 = mountFloatingHUD(item1, { position: "top-right" });
      const u2 = mountFloatingHUD(item2, { position: "top-right" });

      const container = document.getElementById("agy-hud-container")!;
      const slot = container.querySelector('[data-hud-position="top-right"]')!;
      assert.equal(slot.childNodes.length, 2);

      u1();
      assert.equal(slot.childNodes.length, 1);
      assert.ok(document.getElementById("agy-hud-container"));

      u2();
      assert.equal(document.getElementById("agy-hud-container"), null);
    });
  });

  describe("mountHeader", () => {
    test("mounts into header toolbar if [data-testid='pane-titlebar-toolbar'] exists", () => {
      const header = el("header", { "data-main-content-header": "true" }, [
        el("div", { "data-testid": "pane-titlebar-toolbar" }),
      ]);
      document.body.appendChild(header);

      const button = el("button", { id: "header-action" }, ["Test Action"]);
      const unmount = mountHeader(button);

      const toolbar = header.querySelector('[data-testid="pane-titlebar-toolbar"]')!;
      assert.ok(toolbar.contains(button), "Button should be mounted in toolbar");

      unmount();
      assert.equal(toolbar.contains(button), false, "Button should be unmounted");
      unmount(); // Idempotency check
    });

    test("mounts into header element if no toolbar present", () => {
      const header = el("header", { "data-main-content-header": "true" });
      document.body.appendChild(header);

      const status = el("span", { id: "status-indicator" }, ["Online"]);
      const unmount = mountHeader(status);

      assert.ok(header.contains(status), "Status should be inside header");

      unmount();
      assert.equal(header.contains(status), false);
    });

    test("mounts top-docked bar above mainBody when no header exists, preserving conversation view layout", () => {
      const main = el("main", { class: "flex-1 flex flex-col h-full" });
      const mainBody = el("div", { "data-main-content-body": "true" });
      const convView = el("div", {
        "data-testid": "conversation-view",
        class: "flex flex-col h-full w-full",
      });
      mainBody.appendChild(convView);
      main.appendChild(mainBody);
      document.body.appendChild(main);

      const dockItem = el("div", { id: "dock-item" }, ["Dock Content"]);
      const unmount = mountHeader(dockItem);

      const dock = document.getElementById("agy-header-dock");
      assert.ok(dock, "Dock container should be created");
      assert.ok(dock.contains(dockItem));
      assert.equal(dock.parentElement, main, "Dock should be placed in main above mainBody");
      // Invariant check: conversation-view must never have display: block
      assert.notEqual(convView.style.getPropertyValue("display"), "block");

      unmount();
      assert.equal(document.getElementById("agy-header-dock"), null, "Empty dock should be removed");
    });

    test("dynamically promotes element from fallback dock to toolbar when toolbar appears", () => {
      // Start with only main container (no header yet)
      const main = el("main", { class: "flex-1 flex flex-col h-full" });
      const mainBody = el("div", { "data-main-content-body": "true" });
      main.appendChild(mainBody);
      document.body.appendChild(main);

      const widget = el("button", { id: "promoted-widget" }, ["Widget"]);
      const unmount = mountHeader(widget);

      const initialDock = document.getElementById("agy-header-dock");
      assert.ok(initialDock && initialDock.contains(widget), "Widget should start in dock");

      // Now React mounts the content header with toolbar
      const header = el("header", { "data-main-content-header": "true" }, [
        el("div", { "data-testid": "pane-titlebar-toolbar" }),
      ]);
      main.insertBefore(header, mainBody);

      const toolbar = header.querySelector('[data-testid="pane-titlebar-toolbar"]')!;
      assert.ok(toolbar.contains(widget), "Widget should be automatically promoted to toolbar");
      assert.equal(document.getElementById("agy-header-dock"), null, "Empty dock should be cleaned up");

      unmount();
      assert.equal(toolbar.contains(widget), false);
    });
  });

  describe("mountComposer", () => {
    test("mounts next to model selector trigger container when present", () => {
      const conv = el("div", {
        "data-testid": "conversation-view",
        class: "flex flex-col h-full w-full",
      });
      const inputCard = el("div", { "data-testid": "agent-input-box" });
      const footerRow = el("div", { class: "flex items-center gap-1 min-w-0" });
      const modelWrapper = el("div", { class: "min-w-0 no-focus-agent-input" });
      const modelBtn = el("button", { "data-testid": "model-selector-trigger" }, ["Gemini Flash"]);

      modelWrapper.appendChild(modelBtn);
      footerRow.appendChild(modelWrapper);
      inputCard.appendChild(footerRow);
      conv.appendChild(inputCard);
      document.body.appendChild(conv);

      const pill = el("button", { id: "test-effort-pill" }, ["⚡ Effort: High"]);
      const unmount = mountComposer(pill);

      assert.equal(pill.parentElement, footerRow, "Pill should be mounted in footerRow next to model selector");
      assert.equal(pill.getAttribute("data-agy-mounted-slot"), "composer");

      // Invariant check
      assert.notEqual(conv.style.getPropertyValue("display"), "block");

      unmount();
      assert.equal(pill.parentElement, null, "Pill should be removed after unmount");
      unmount(); // Idempotency check
    });

    test("mounts next to permissions selector trigger if no model selector present", () => {
      const conv = el("div", { "data-testid": "conversation-view" });
      const permWrapper = el("div", { class: "shrink-0 flex items-center gap-0.5" });
      const permBtn = el("button", { "data-testid": "permissions-selector-trigger" }, ["Turbo"]);

      permWrapper.appendChild(permBtn);
      conv.appendChild(permWrapper);
      document.body.appendChild(conv);

      const pill = el("button", { id: "test-effort-pill-2" });
      const unmount = mountComposer(pill);

      assert.equal(pill.parentElement, permWrapper, "Pill should mount into permWrapper");

      unmount();
      assert.equal(pill.parentElement, null);
    });

    test("mounts into composer root/footer as fallback", () => {
      const conv = el("div", { "data-testid": "conversation-view" });
      const composerFooter = el("div", { "data-agent-composer-root": "" });
      conv.appendChild(composerFooter);
      document.body.appendChild(conv);

      const pill = el("button", { id: "test-effort-pill-3" });
      const unmount = mountComposer(pill);

      assert.equal(pill.parentElement, composerFooter);

      unmount();
      assert.equal(pill.parentElement, null);
    });
  });

  describe("registerShortcut", () => {
    test("registers shortcut and triggers handler with platform-normalized modifier", () => {
      let triggered = 0;
      let lastEvent: any = null;

      const unregister = registerShortcut("Cmd+Shift+M", (e) => {
        triggered++;
        lastEvent = e;
      });

      const onMac = isMac();
      const matchEvent = {
        type: "keydown",
        metaKey: onMac,
        ctrlKey: !onMac,
        shiftKey: true,
        altKey: false,
        key: "m",
        code: "KeyM",
      };
      (document as any).dispatchEvent(matchEvent);

      assert.equal(triggered, 1);
      assert.equal(lastEvent, matchEvent);

      // Non-matching event (missing Shift)
      (document as any).dispatchEvent({
        type: "keydown",
        metaKey: onMac,
        ctrlKey: !onMac,
        shiftKey: false,
        altKey: false,
        key: "m",
      });
      assert.equal(triggered, 1, "Should not trigger without Shift");

      // Non-matching event (different key)
      (document as any).dispatchEvent({
        type: "keydown",
        metaKey: onMac,
        ctrlKey: !onMac,
        shiftKey: true,
        altKey: false,
        key: "k",
      });
      assert.equal(triggered, 1, "Should not trigger on key k");

      // Unregister and verify no more events trigger
      unregister();
      (document as any).dispatchEvent(matchEvent);
      assert.equal(triggered, 1, "Should not trigger after unregistering");
      unregister(); // Idempotency check
    });

    test("handles Ctrl and Alt shortcuts", () => {
      let altCount = 0;
      let ctrlCount = 0;

      const uAlt = registerShortcut("Alt+T", () => {
        altCount++;
      });
      const uCtrl = registerShortcut("Ctrl+Shift+P", () => {
        ctrlCount++;
      });

      (document as any).dispatchEvent({
        type: "keydown",
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        key: "t",
      });
      assert.equal(altCount, 1);
      assert.equal(ctrlCount, 0);

      (document as any).dispatchEvent({
        type: "keydown",
        ctrlKey: true,
        shiftKey: true,
        metaKey: false,
        altKey: false,
        key: "p",
      });
      assert.equal(altCount, 1);
      assert.equal(ctrlCount, 1);

      uAlt();
      uCtrl();
    });

    test("handles special keys: plus (++), space, esc, enter, arrow keys", () => {
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

      // Plus key
      (document as any).dispatchEvent({
        type: "keydown",
        ctrlKey: true,
        shiftKey: false,
        metaKey: false,
        altKey: false,
        key: "+",
        code: "Equal",
      });
      assert.equal(plusCount, 1, "Ctrl++ should match plus key");

      // Space key
      (document as any).dispatchEvent({
        type: "keydown",
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        key: " ",
        code: "Space",
      });
      assert.equal(spaceCount, 1, "Alt+Space should match spacebar");

      // Esc key
      (document as any).dispatchEvent({
        type: "keydown",
        ctrlKey: true,
        shiftKey: false,
        metaKey: false,
        altKey: false,
        key: "Escape",
        code: "Escape",
      });
      assert.equal(escCount, 1, "Ctrl+Esc should match Escape");

      // Up arrow key
      (document as any).dispatchEvent({
        type: "keydown",
        ctrlKey: true,
        shiftKey: false,
        metaKey: false,
        altKey: false,
        key: "ArrowUp",
        code: "ArrowUp",
      });
      assert.equal(upCount, 1, "Ctrl+Up should match ArrowUp");

      uPlus();
      uSpace();
      uEsc();
      uUp();
    });

    test("parseCombo and matchesKeyboardEvent unit tests", () => {
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
          { type: "keydown", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, key: "" } as any,
          { ctrl: false, meta: true, shift: false, alt: false, key: "" }
        ),
        false
      );
    });
  });

  describe("observeConversation", () => {
    test("observes new elements appended to conversation-view and ignores composer", () => {
      const conv = el("div", {
        "data-testid": "conversation-view",
        class: "flex flex-col h-full",
      });
      const messagesContainer = el("div", { id: "child-0-messages" });
      conv.appendChild(messagesContainer);
      document.body.appendChild(conv);

      const observedNodes: HTMLElement[] = [];
      const disconnect = observeConversation((node) => {
        observedNodes.push(node);
      });

      const newMsg = el("div", { class: "message" }, ["New message text"]);
      messagesContainer.appendChild(newMsg);

      assert.equal(observedNodes.length, 1);
      assert.equal(observedNodes[0], newMsg);

      // Composer should be ignored
      const composer = el("div", { id: "child-1-composer" });
      conv.appendChild(composer);
      assert.equal(observedNodes.length, 1);

      disconnect();

      const anotherMsg = el("div", { class: "message-2" });
      messagesContainer.appendChild(anotherMsg);
      assert.equal(observedNodes.length, 1, "Should not trigger after disconnect");
      disconnect(); // Idempotency check
    });

    test("resubscribes when conversation-view is replaced on route switch", () => {
      // 1. Initial conversation view
      const conv1 = el("div", { "data-testid": "conversation-view" });
      document.body.appendChild(conv1);

      const observedNodes: HTMLElement[] = [];
      const disconnect = observeConversation((node) => {
        observedNodes.push(node);
      });

      const msg1 = el("div", { id: "conv1-msg" });
      conv1.appendChild(msg1);
      assert.equal(observedNodes.length, 1);
      assert.equal(observedNodes[0], msg1);

      // 2. Switch conversation (conv1 unmounted, conv2 mounted)
      conv1.remove();
      const conv2 = el("div", { "data-testid": "conversation-view" });
      document.body.appendChild(conv2);

      // 3. New message arrives in conv2
      const msg2 = el("div", { id: "conv2-msg" });
      conv2.appendChild(msg2);

      assert.equal(observedNodes.length, 2, "Should observe messages in new conversation view after switch");
      assert.equal(observedNodes[1], msg2);

      disconnect();
    });
  });
});
