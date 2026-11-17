// Minimal In-Memory DOM Mock for AGY Boost Client Tests (Zero Dependencies)

export class MockNode {
  static ELEMENT_NODE = 1;
  static TEXT_NODE = 3;
  nodeType = 1;
  childNodes: MockNode[] = [];
  parentNode: MockNode | null = null;

  appendChild<T extends MockNode>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    MockMutationObserver.notify({
      type: "childList",
      target: this,
      addedNodes: [child],
      removedNodes: [],
    });
    return child;
  }

  insertBefore<T extends MockNode>(child: T, ref: MockNode | null): T {
    if (!ref) {
      return this.appendChild(child);
    }
    const idx = this.childNodes.indexOf(ref);
    if (idx === -1) {
      return this.appendChild(child);
    }
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.splice(idx, 0, child);
    MockMutationObserver.notify({
      type: "childList",
      target: this,
      addedNodes: [child],
      removedNodes: [],
    });
    return child;
  }

  removeChild<T extends MockNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
      MockMutationObserver.notify({
        type: "childList",
        target: this,
        addedNodes: [],
        removedNodes: [child],
      });
    }
    return child;
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  contains(other: MockNode | null): boolean {
    let curr: MockNode | null = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  get parentElement(): MockElement | null {
    return this.parentNode instanceof MockElement ? this.parentNode : null;
  }

  get firstChild(): MockNode | null {
    return this.childNodes[0] || null;
  }

  get children(): MockElement[] {
    return this.childNodes.filter((c): c is MockElement => c instanceof MockElement);
  }

  get isConnected(): boolean {
    let curr: MockNode | null = this;
    while (curr) {
      if (curr instanceof MockDocument) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild(new MockTextNode(val));
    }
  }
}

export class MockTextNode extends MockNode {
  override nodeType = 3;

  constructor(public text: string) {
    super();
  }

  override get textContent(): string {
    return this.text;
  }

  override set textContent(val: string) {
    this.text = val;
  }
}

export class MockCSSStyleDeclaration {
  private properties = new Map<string, string>();

  setProperty(property: string, value: string): void {
    this.properties.set(property, value);
  }

  getPropertyValue(property: string): string {
    return this.properties.get(property) || "";
  }

  removeProperty(property: string): string {
    const val = this.getPropertyValue(property);
    this.properties.delete(property);
    return val;
  }

  get cssText(): string {
    const entries: string[] = [];
    for (const [k, v] of this.properties.entries()) {
      entries.push(`${k}: ${v};`);
    }
    return entries.join(" ");
  }

  set cssText(val: string) {
    this.properties.clear();
    const declarations = val.split(";");
    for (const decl of declarations) {
      const trimmed = decl.trim();
      if (!trimmed) continue;
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex !== -1) {
        const prop = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        this.properties.set(prop, value);
      }
    }
  }

  get position(): string {
    return this.getPropertyValue("position");
  }
  set position(val: string) {
    this.setProperty("position", val);
  }

  get pointerEvents(): string {
    return this.getPropertyValue("pointer-events");
  }
  set pointerEvents(val: string) {
    this.setProperty("pointer-events", val);
  }

  get zIndex(): string {
    return this.getPropertyValue("z-index");
  }
  set zIndex(val: string) {
    this.setProperty("z-index", val);
  }

  get top(): string {
    return this.getPropertyValue("top");
  }
  set top(val: string) {
    this.setProperty("top", val);
  }

  get left(): string {
    return this.getPropertyValue("left");
  }
  set left(val: string) {
    this.setProperty("left", val);
  }

  get right(): string {
    return this.getPropertyValue("right");
  }
  set right(val: string) {
    this.setProperty("right", val);
  }

  get bottom(): string {
    return this.getPropertyValue("bottom");
  }
  set bottom(val: string) {
    this.setProperty("bottom", val);
  }

  get display(): string {
    return this.getPropertyValue("display");
  }
  set display(val: string) {
    this.setProperty("display", val);
  }
}

function matchesSelectorPart(el: MockElement, sel: string): boolean {
  sel = sel.trim();
  if (!sel) return false;

  // Handle #id
  if (sel.startsWith("#")) {
    return el.id === sel.slice(1) || el.getAttribute("id") === sel.slice(1);
  }
  // Handle .class
  if (sel.startsWith(".")) {
    return el.className.split(/\s+/u).includes(sel.slice(1));
  }
  // Handle [attr="value"] or [attr]
  if (sel.startsWith("[")) {
    const attrMatch = sel.match(/^\[([^=\]]+)(?:="?([^"\]]*)"?)?\]$/u);
    if (attrMatch) {
      const [, name, val] = attrMatch;
      if (!name) return false;
      if (val !== undefined) {
        return el.getAttribute(name) === val;
      }
      return el.hasAttribute(name);
    }
  }
  // Handle tag[attr="value"]
  const tagAttrMatch = sel.match(/^([a-zA-Z0-9_-]+)\[([^=\]]+)(?:="?([^"\]]*)"?)?\]$/u);
  if (tagAttrMatch) {
    const [, tag, name, val] = tagAttrMatch;
    if (!(tag && name) || el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (val !== undefined) {
      return el.getAttribute(name) === val;
    }
    return el.hasAttribute(name);
  }

  // Handle tag
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function queryAllDescendants(root: MockNode, selector: string): MockElement[] {
  const parts = selector.trim().match(/(?:\[[^\]]+\]|[^\s[\]])+/gu) || [];
  if (parts.length === 0 || !parts[0]) return [];

  let currentElements: MockElement[] = [];
  const collect = (node: MockNode, fn: (el: MockElement) => boolean) => {
    for (const child of node.childNodes) {
      if (child instanceof MockElement) {
        if (fn(child)) currentElements.push(child);
        collect(child, fn);
      }
    }
  };

  const firstPart = parts[0];
  if (firstPart) {
    collect(root, (el) => matchesSelectorPart(el, firstPart));
  }

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const nextElements: MockElement[] = [];
    for (const el of currentElements) {
      const sub: MockElement[] = [];
      const collectSub = (n: MockNode) => {
        for (const child of n.childNodes) {
          if (child instanceof MockElement) {
            if (part && matchesSelectorPart(child, part)) sub.push(child);
            collectSub(child);
          }
        }
      };
      collectSub(el);
      for (const s of sub) {
        if (!nextElements.includes(s)) nextElements.push(s);
      }
    }
    currentElements = nextElements;
  }

  return currentElements;
}

export interface MockDOMEvent {
  type: string;
  target?: unknown;
  currentTarget?: unknown;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  [key: string]: unknown;
}

export type MockEventListener = (event: Event | MockDOMEvent) => void;

export class MockElement extends MockNode {
  override nodeType = 1;
  attributes = new Map<string, string>();
  listeners = new Map<string, MockEventListener[]>();
  style = new MockCSSStyleDeclaration();
  clientHeight = 0;
  scrollHeight = 0;
  offsetHeight = 0;

  get dataset(): Record<string, string> {
    const data: Record<string, string> = {};
    for (const [key, val] of this.attributes.entries()) {
      if (key.startsWith("data-")) {
        const camel = key.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
        data[camel] = val;
      }
    }
    return new Proxy(data, {
      set: (target, prop, value) => {
        if (typeof prop === "string") {
          target[prop] = String(value);
          const kebab = `data-${prop.replace(/([A-Z])/gu, "-$1").toLowerCase()}`;
          this.setAttribute(kebab, String(value));
          return true;
        }
        return false;
      },
      get: (target, prop) => {
        if (typeof prop === "string") {
          return target[prop];
        }
        return undefined;
      },
    });
  }

  constructor(public tagName: string) {
    super();
  }

  get id(): string {
    return this.getAttribute("id") || "";
  }

  set id(val: string) {
    this.setAttribute("id", val);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  addEventListener(type: string, listener: MockEventListener, _capture?: unknown): void {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: MockEventListener, _capture?: unknown): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(listener);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  dispatchEvent(event: MockDOMEvent): boolean {
    const list = this.listeners.get(event.type) || [];
    for (const listener of list) {
      listener(event);
    }
    return true;
  }

  onclick: MockEventListener | null = null;

  click(): void {
    const event = {
      type: "click",
      target: this,
      currentTarget: this,
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    if (typeof this.onclick === "function") {
      this.onclick(event);
    }
    this.dispatchEvent(event);
  }

  get className(): string {
    return this.getAttribute("class") || "";
  }

  set className(val: string) {
    this.setAttribute("class", val);
  }

  get classList(): {
    add: (...tokens: string[]) => void;
    remove: (...tokens: string[]) => void;
    contains: (token: string) => boolean;
    toggle: (token: string, force?: boolean) => boolean;
  } {
    const getTokens = () => (this.getAttribute("class") || "").split(/\s+/u).filter(Boolean);

    const setTokens = (tokens: string[]) => {
      this.setAttribute("class", tokens.join(" "));
    };

    return {
      add: (...tokens: string[]) => {
        const current = getTokens();
        for (const token of tokens) {
          if (!current.includes(token)) current.push(token);
        }
        setTokens(current);
      },
      remove: (...tokens: string[]) => {
        const current = getTokens().filter((t) => !tokens.includes(t));
        setTokens(current);
      },
      contains: (token: string) => getTokens().includes(token),
      toggle: (token: string, force?: boolean) => {
        const current = getTokens();
        const has = current.includes(token);
        const shouldAdd = force === undefined ? !has : force;
        if (shouldAdd && !has) {
          current.push(token);
          setTokens(current);
          return true;
        }
        if (!shouldAdd && has) {
          setTokens(current.filter((t) => t !== token));
          return false;
        }
        return has;
      },
    };
  }

  closest(selector: string): MockElement | null {
    let curr: MockNode | null = this;
    while (curr) {
      if (curr instanceof MockElement && matchesSelectorPart(curr, selector)) {
        return curr;
      }
      curr = curr.parentNode;
    }
    return null;
  }

  querySelector(selector: string): MockElement | null {
    const res = this.querySelectorAll(selector);
    return res[0] || null;
  }

  querySelectorAll(selector: string): MockElement[] {
    return queryAllDescendants(this, selector);
  }
}

export class MockDocument extends MockNode {
  documentElement: MockElement;
  head: MockElement;
  body: MockElement;
  listeners = new Map<string, MockEventListener[]>();

  constructor() {
    super();
    this.documentElement = new MockElement("html");
    this.head = new MockElement("head");
    this.body = new MockElement("body");
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }

  createElement(tag: string): MockElement {
    return new MockElement(tag);
  }

  createTextNode(text: string): MockTextNode {
    return new MockTextNode(text);
  }

  getElementById(id: string): MockElement | null {
    return this.querySelector(`#${id}`);
  }

  querySelector(selector: string): MockElement | null {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector: string): MockElement[] {
    return this.documentElement.querySelectorAll(selector);
  }

  addEventListener(type: string, listener: MockEventListener, _capture?: unknown): void {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: MockEventListener, _capture?: unknown): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(listener);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  dispatchEvent(event: MockDOMEvent): boolean {
    const list = this.listeners.get(event.type) || [];
    for (const listener of list) {
      listener(event);
    }
    return true;
  }

  onclick: MockEventListener | null = null;

  click(): void {
    const event = {
      type: "click",
      target: this,
      currentTarget: this,
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    if (typeof this.onclick === "function") {
      this.onclick(event);
    }
    this.dispatchEvent(event);
  }
}

export interface MockMutationRecord {
  type: string;
  target: MockNode;
  addedNodes?: MockNode[] | undefined;
  removedNodes?: MockNode[] | undefined;
  attributeName?: string | null | undefined;
  oldValue?: string | null | undefined;
}

export class MockMutationObserver {
  private static activeObservers: Array<{
    observer: MockMutationObserver;
    target: MockNode;
    options?: { subtree?: boolean; childList?: boolean; attributes?: boolean } | undefined;
  }> = [];

  constructor(
    public callback: (mutations: MockMutationRecord[], observer: MockMutationObserver) => void,
  ) {}

  observe(
    target: MockNode,
    options?: { subtree?: boolean; childList?: boolean; attributes?: boolean } | undefined,
  ): void {
    MockMutationObserver.activeObservers.push({
      observer: this,
      target,
      options,
    });
  }

  disconnect(): void {
    MockMutationObserver.activeObservers = MockMutationObserver.activeObservers.filter(
      (entry) => entry.observer !== this,
    );
  }

  static notify(record: {
    type: string;
    target: MockNode;
    addedNodes: MockNode[];
    removedNodes: MockNode[];
  }): void {
    for (const entry of [...MockMutationObserver.activeObservers]) {
      if (
        entry.target === record.target ||
        (entry.options?.subtree && entry.target.contains(record.target))
      ) {
        try {
          entry.observer.callback([record], entry.observer);
        } catch {}
      }
    }
  }
}

interface GlobalDomScope {
  document?: unknown;
  Node?: unknown;
  HTMLElement?: unknown;
  MutationObserver?: unknown;
  window?: unknown;
  getComputedStyle?: unknown;
}

export function setupMockDOM(): () => void {
  const globalScope = globalThis as unknown as GlobalDomScope;
  const origDocument = globalScope.document;
  const origNode = globalScope.Node;
  const origElement = globalScope.HTMLElement;
  const origMutationObserver = globalScope.MutationObserver;
  const origWindow = globalScope.window;
  const origGetComputedStyle = globalScope.getComputedStyle;

  const mockDoc = new MockDocument();
  const mockGetComputedStyle = (el: MockElement) => el.style;

  (
    mockDoc as unknown as { getComputedStyle?: (el: MockElement) => MockCSSStyleDeclaration }
  ).getComputedStyle = mockGetComputedStyle;
  globalScope.document = mockDoc;
  globalScope.Node = MockNode;
  globalScope.HTMLElement = MockElement;
  globalScope.MutationObserver = MockMutationObserver;
  globalScope.window = mockDoc;
  globalScope.getComputedStyle = mockGetComputedStyle;

  return () => {
    globalScope.document = origDocument;
    globalScope.Node = origNode;
    globalScope.HTMLElement = origElement;
    globalScope.MutationObserver = origMutationObserver;
    globalScope.window = origWindow;
    globalScope.getComputedStyle = origGetComputedStyle;
  };
}
