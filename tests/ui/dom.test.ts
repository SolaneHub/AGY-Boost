import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupMockDOM } from "../harness/mock-dom.js";
import { el } from "../../src/client/ui/dom.js";

describe("DOM Builder (el)", () => {
  let teardown: () => void;

  before(() => {
    teardown = setupMockDOM();
  });

  after(() => {
    teardown();
  });

  test("creates an element with correct tagName", () => {
    const div = el("div");
    assert.equal(div.tagName.toLowerCase(), "div");
  });

  test("sets basic attributes", () => {
    const input = el("input", {
      type: "text",
      id: "search-input",
      placeholder: "Search mods...",
    });
    assert.equal(input.getAttribute("type"), "text");
    assert.equal(input.getAttribute("id"), "search-input");
    assert.equal(input.getAttribute("placeholder"), "Search mods...");
  });

  test("handles class and className aliases", () => {
    const el1 = el("div", { class: "btn primary" });
    assert.equal(el1.getAttribute("class"), "btn primary");

    const el2 = el("span", { className: "badge active" });
    assert.equal(el2.getAttribute("class"), "badge active");
  });

  test("handles boolean attributes", () => {
    const buttonEnabled = el("button", { disabled: false });
    assert.equal(buttonEnabled.hasAttribute("disabled"), false);

    const buttonDisabled = el("button", { disabled: true });
    assert.equal(buttonDisabled.hasAttribute("disabled"), true);
    assert.equal(buttonDisabled.getAttribute("disabled"), "");
  });

  test("sets inline cssText via style attribute", () => {
    const box = el("div", { style: "color: red; opacity: 1;" });
    assert.equal(box.style.getPropertyValue("color"), "red");
    assert.equal(box.style.getPropertyValue("opacity"), "1");
  });

  test("ignores null and undefined attributes", () => {
    const element = el("div", {
      id: "valid",
      title: undefined,
      tabindex: null,
    });
    assert.equal(element.getAttribute("id"), "valid");
    assert.equal(element.hasAttribute("title"), false);
    assert.equal(element.hasAttribute("tabindex"), false);
  });

  test("attaches event listeners for on* props", () => {
    let clicked = 0;
    const button = el("button", {
      onclick: () => {
        clicked++;
      },
    });

    button.click();
    button.click();
    assert.equal(clicked, 2);
  });

  test("nests child nodes, strings, and ignores null/undefined", () => {
    const parent = el("div", { id: "parent" }, [
      "Text first",
      null,
      el("span", { class: "child" }, ["Child text"]),
      undefined,
      "Text last",
    ]);

    assert.equal(parent.childNodes.length, 3);
    assert.equal(parent.childNodes[0]?.textContent, "Text first");
    assert.equal((parent.childNodes[1] as HTMLElement).tagName.toLowerCase(), "span");
    assert.equal(parent.childNodes[1]?.textContent, "Child text");
    assert.equal(parent.childNodes[2]?.textContent, "Text last");
    assert.equal(parent.textContent, "Text firstChild textText last");
  });
});
