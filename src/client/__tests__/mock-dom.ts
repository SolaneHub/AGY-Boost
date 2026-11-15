// Minimal In-Memory DOM Mock for AGY Boost Client Tests (Zero Dependencies)

export class MockNode {
  childNodes: MockNode[] = [];
  parentNode: MockNode | null = null;

  appendChild<T extends MockNode>(child: T): T {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild<T extends MockNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
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
}

export class MockElement extends MockNode {
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<(event: any) => void>>();
  style = new MockCSSStyleDeclaration();

  constructor(public tagName: string) {
    super();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.has(name) ? this.attributes.get(name)! : null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(listener);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  dispatchEvent(event: { type: string; [key: string]: any }): boolean {
    const list = this.listeners.get(event.type) || [];
    for (const listener of list) {
      listener(event);
    }
    return true;
  }

  get className(): string {
    return this.getAttribute("class") || "";
  }

  set className(val: string) {
    this.setAttribute("class", val);
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const traverse = (node: MockNode) => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          if (selector.startsWith(".") && child.className.includes(selector.slice(1))) {
            results.push(child);
          } else if (selector.toLowerCase() === child.tagName.toLowerCase()) {
            results.push(child);
          }
          traverse(child);
        }
      }
    };
    traverse(this);
    return results;
  }
}

export class MockDocument extends MockNode {
  documentElement: MockElement;
  head: MockElement;
  body: MockElement;

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

  addEventListener(_type: string, _listener: any): void {}
}

export function setupMockDOM(): () => void {
  const origDocument = (globalThis as any).document;
  const origNode = (globalThis as any).Node;
  const origElement = (globalThis as any).HTMLElement;

  const mockDoc = new MockDocument();
  (globalThis as any).document = mockDoc;
  (globalThis as any).Node = MockNode;
  (globalThis as any).HTMLElement = MockElement;

  return () => {
    (globalThis as any).document = origDocument;
    (globalThis as any).Node = origNode;
    (globalThis as any).HTMLElement = origElement;
  };
}
