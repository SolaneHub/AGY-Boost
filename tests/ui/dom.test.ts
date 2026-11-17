import { test as it, describe, before, after } from "node:test";
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

  it("creates element with attributes, class aliases, boolean flags and styles", () => {
    const input = el("input", {
      type: "text",
      id: "search-input",
      placeholder: "Search mods...",
      class: "input-base primary",
      disabled: true,
      style: "color: red; opacity: 1;",
      title: undefined,
      tabindex: null,
    });

    assert.equal(input.tagName.toLowerCase(), "input");
    assert.equal(input.getAttribute("type"), "text");
    assert.equal(input.getAttribute("id"), "search-input");
    assert.equal(input.getAttribute("placeholder"), "Search mods...");
    assert.equal(input.getAttribute("class"), "input-base primary");
    assert.equal(input.hasAttribute("disabled"), true);
    assert.equal(input.style.getPropertyValue("color"), "red");
    assert.equal(input.style.getPropertyValue("opacity"), "1");
    assert.equal(input.hasAttribute("title"), false);
    assert.equal(input.hasAttribute("tabindex"), false);

    // Verify className alias and false boolean attribute
    const span = el("span", { className: "badge active", hidden: false });
    assert.equal(span.getAttribute("class"), "badge active");
    assert.equal(span.hasAttribute("hidden"), false);
  });

  it("attaches event listeners for on* props", () => {
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

  it("nests child nodes, strings, and ignores null/undefined", () => {
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
