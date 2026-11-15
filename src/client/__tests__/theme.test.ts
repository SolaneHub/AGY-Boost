import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupMockDOM } from "./mock-dom.js";
import { setTheme } from "../ui/theme.js";

describe("Theme Engine (setTheme)", () => {
  let teardown: () => void;

  before(() => {
    teardown = setupMockDOM();
  });

  after(() => {
    teardown();
  });

  test("sets CSS custom properties on document.documentElement", () => {
    const root = document.documentElement;
    const cleanup = setTheme({
      "--primary-color": "#ff0000",
      "--sidebar-width": "260px",
      "non-css-variable": "ignored",
    });

    assert.equal(root.style.getPropertyValue("--primary-color"), "#ff0000");
    assert.equal(root.style.getPropertyValue("--sidebar-width"), "260px");
    assert.equal(root.style.getPropertyValue("non-css-variable"), "");

    cleanup();
  });

  test("cleanup function removes newly added variables", () => {
    const root = document.documentElement;
    const cleanup = setTheme({
      "--temp-var": "123px",
    });

    assert.equal(root.style.getPropertyValue("--temp-var"), "123px");

    cleanup();

    assert.equal(root.style.getPropertyValue("--temp-var"), "");
  });

  test("cleanup function restores previous values of existing variables", () => {
    const root = document.documentElement;
    root.style.setProperty("--existing-var", "original-value");

    const cleanup = setTheme({
      "--existing-var": "overridden-value",
      "--new-var": "hello",
    });

    assert.equal(root.style.getPropertyValue("--existing-var"), "overridden-value");
    assert.equal(root.style.getPropertyValue("--new-var"), "hello");

    cleanup();

    assert.equal(root.style.getPropertyValue("--existing-var"), "original-value");
    assert.equal(root.style.getPropertyValue("--new-var"), "");

    // Cleanup root state
    root.style.removeProperty("--existing-var");
  });
});
