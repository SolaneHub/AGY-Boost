// AGY Boost UI Slots, Floating HUD, and Global Shortcuts Engine
// Willow Design System compatible, zero-framework DOM integration.

export type HUDPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export interface HUDOptions {
  position?: HUDPosition;
}

interface ParsedShortcut {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

export function isMac(): boolean {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent || "";
    const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData;
    const platform = userAgentData?.platform || navigator.platform || "";
    if (/mac/iu.test(platform) || /mac/iu.test(ua)) return true;
    if (/linux|win/iu.test(platform) || /linux|windows/iu.test(ua)) return false;
  }
  const globalProc = (globalThis as { process?: { platform?: string } }).process;
  if (typeof globalProc !== "undefined" && globalProc.platform) {
    return globalProc.platform === "darwin";
  }
  return false;
}

export function normalizeKey(k: string): string {
  const lower = k.toLowerCase();
  switch (lower) {
    case "esc":
      return "escape";
    case "return":
      return "enter";
    case "space":
    case "spacebar":
    case " ":
      return "space";
    case "up":
      return "arrowup";
    case "down":
      return "arrowdown";
    case "left":
      return "arrowleft";
    case "right":
      return "arrowright";
    case "plus":
      return "+";
    case "minus":
      return "-";
    case "del":
      return "delete";
    case "ins":
      return "insert";
    default:
      return lower;
  }
}

export function parseCombo(combo: string, mac: boolean): ParsedShortcut {
  let str = combo.trim();
  let key = "";

  // Handle + key when written as Cmd++ or +
  if (str.endsWith("++")) {
    key = "+";
    str = str.slice(0, -2);
  } else if (str === "+") {
    key = "+";
    str = "";
  }

  const rawTokens = str
    .split("+")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;

  for (const token of rawTokens) {
    if (
      token === "cmd" ||
      token === "command" ||
      token === "cmdorctrl" ||
      token === "commandorcontrol" ||
      token === "mod"
    ) {
      if (mac) {
        meta = true;
      } else {
        ctrl = true;
      }
    } else if (token === "ctrl" || token === "control") {
      ctrl = true;
    } else if (token === "meta" || token === "win" || token === "super") {
      meta = true;
    } else if (token === "alt" || token === "option") {
      alt = true;
    } else if (token === "shift") {
      shift = true;
    } else {
      key = token;
    }
  }

  return { ctrl, meta, shift, alt, key };
}

export function matchesKeyboardEvent(e: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  if (!shortcut.key) return false;

  if (Boolean(e.ctrlKey) !== shortcut.ctrl) return false;
  if (Boolean(e.metaKey) !== shortcut.meta) return false;
  if (Boolean(e.shiftKey) !== shortcut.shift) return false;
  if (Boolean(e.altKey) !== shortcut.alt) return false;

  const target = normalizeKey(shortcut.key);
  const eventKey = normalizeKey(e.key || "");
  const eventCode = (e.code || "").toLowerCase();

  // Direct match on normalized key
  if (eventKey === target) return true;

  // Direct match on code (e.g. "Escape", "Space", "Enter", "ArrowUp")
  if (eventCode === target) return true;

  // Match key or digit code prefix (e.g. target "m" -> code "keym", target "1" -> code "digit1")
  if (eventCode === `key${target}` || eventCode === `digit${target}`) return true;

  // Keyboard plus/equal key matching
  if (
    (target === "+" || target === "=") &&
    (eventCode === "equal" || eventKey === "+" || eventKey === "=")
  ) {
    return true;
  }

  // Keyboard minus key matching
  if (target === "-" && (eventCode === "minus" || eventKey === "-")) {
    return true;
  }

  return false;
}

/**
 * Registers a global keyboard shortcut (e.g., "Cmd+Shift+M", "Ctrl+Shift+M", "Alt+T").
 * Normalizes Cmd (Meta) on Mac and Ctrl on Windows/Linux.
 * Returns an unregister function to remove the shortcut listener.
 */
export function registerShortcut(combo: string, handler: (e: KeyboardEvent) => void): () => void {
  const parsed = parseCombo(combo, isMac());
  const target: EventTarget | null =
    typeof window === "undefined" ? (typeof document === "undefined" ? null : document) : window;
  if (!target || typeof target.addEventListener !== "function") {
    return () => {};
  }

  let unregistered = false;

  const listener = (event: Event) => {
    if (unregistered) return;
    const keyEvent = event as KeyboardEvent;
    if (matchesKeyboardEvent(keyEvent, parsed)) {
      try {
        handler(keyEvent);
      } catch {}
    }
  };

  target.addEventListener("keydown", listener, true);

  return () => {
    if (unregistered) return;
    unregistered = true;
    target.removeEventListener("keydown", listener, true);
  };
}

interface MountTarget {
  target: HTMLElement;
  method: "prepend" | "append";
  priority: number;
}

/**
 * Mounts an element into Antigravity's top header area or a top-docked bar
 * without affecting [data-testid="conversation-view"] flexbox layout.
 * Returns an unmount function that removes the element.
 */
export function mountHeader(element: HTMLElement): () => void {
  let unmounted = false;
  let observer: MutationObserver | null = null;
  element.setAttribute("data-agy-mounted-slot", "header");

  // Deduplicate: If an element with the same slot and id/mod already exists in DOM, remove old one
  const modId = element.getAttribute("data-agy-mod-id") || element.id;
  if (modId) {
    const selector = element.id
      ? `#${element.id}`
      : `[data-agy-mounted-slot="header"][data-agy-mod-id="${modId}"]`;
    const existing = document.querySelector(selector);
    if (existing && existing !== element) {
      existing.remove();
    }
  }

  const getBestTarget = (): MountTarget | null => {
    // 1. Toolbar inside main content header (Priority 1)
    const toolbar =
      document.querySelector<HTMLElement>(
        '[data-main-content-header="true"] [data-testid="pane-titlebar-toolbar"]',
      ) || document.querySelector<HTMLElement>('[data-testid="pane-titlebar-toolbar"]');
    if (toolbar) {
      return { target: toolbar, method: "prepend", priority: 1 };
    }

    // 2. Main content header element (Priority 2)
    const header =
      document.querySelector<HTMLElement>('[data-main-content-header="true"]') ||
      document.querySelector<HTMLElement>("header");
    if (header) {
      return { target: header, method: "append", priority: 2 };
    }

    // 3. Top-docked bar above main content body outside conversation view (Priority 3)
    const mainBody = document.querySelector<HTMLElement>('[data-main-content-body="true"]');
    if (mainBody?.parentElement) {
      let dock = document.getElementById("agy-header-dock") as HTMLElement | null;
      if (!dock || dock.parentElement !== mainBody.parentElement) {
        if (dock) dock.remove();
        dock = document.createElement("div");
        dock.id = "agy-header-dock";
        dock.className = "flex items-center shrink-0 w-full z-10 border-b border-border";
        mainBody.parentElement.insertBefore(dock, mainBody);
      }
      return { target: dock, method: "append", priority: 3 };
    }

    // 4. Fallback to document body dock (Priority 4)
    const root = document.body || document.documentElement;
    if (root) {
      let dock = document.getElementById("agy-header-dock") as HTMLElement | null;
      if (!dock) {
        dock = document.createElement("div");
        dock.id = "agy-header-dock";
        dock.className = "flex items-center shrink-0 w-full z-10 border-b border-border";
        root.insertBefore(dock, root.firstChild);
      }
      return { target: dock, method: "append", priority: 4 };
    }

    return null;
  };

  const cleanupEmptyDock = () => {
    const dock = document.getElementById("agy-header-dock");
    if (dock && (!dock.childNodes || dock.childNodes.length === 0)) {
      dock.remove();
    }
  };

  const tryAttach = () => {
    if (unmounted || element.getAttribute("data-agy-unmounted") === "true") return;
    const best = getBestTarget();
    if (!best) return;

    // Already attached to the best available target in the DOM
    if (element.parentElement === best.target && element.isConnected) {
      return;
    }

    const prevParent = element.parentElement;

    if (best.method === "prepend") {
      best.target.insertBefore(element, best.target.firstChild);
    } else {
      best.target.appendChild(element);
    }

    // If moved away from a temporary dock, clean up old dock if now empty
    if (
      prevParent &&
      prevParent.id === "agy-header-dock" &&
      prevParent !== best.target &&
      (!prevParent.childNodes || prevParent.childNodes.length === 0)
    ) {
      prevParent.remove();
    }
  };

  tryAttach();

  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      if (unmounted) return;
      tryAttach();
    });

    const root = document.body || document.documentElement;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  return () => {
    if (unmounted) return;
    unmounted = true;
    element.setAttribute("data-agy-unmounted", "true");
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    element.remove();
    cleanupEmptyDock();
  };
}

interface ComposerMountTarget {
  target: HTMLElement;
  method: "append" | "prepend";
}

/**
 * Mounts an element into the chat composer toolbar (next to model selector)
 * without affecting [data-testid="conversation-view"] flexbox layout.
 * Maintains attachment across chat navigation and conversation switching.
 * Returns an unmount function that removes the element.
 */
export function mountComposer(element: HTMLElement): () => void {
  let unmounted = false;
  let observer: MutationObserver | null = null;
  element.setAttribute("data-agy-mounted-slot", "composer");

  // Deduplicate: If an element with the same slot and id/mod already exists in DOM, remove old one
  const modId = element.getAttribute("data-agy-mod-id") || element.id;
  if (modId) {
    const selector = element.id
      ? `#${element.id}`
      : `[data-agy-mounted-slot="composer"][data-agy-mod-id="${modId}"]`;
    const existing = document.querySelector(selector);
    if (existing && existing !== element) {
      existing.remove();
    }
  }

  const getBestTarget = (): ComposerMountTarget | null => {
    // 1. Next to model-selector-trigger container (Priority 1)
    const modelTrigger = document.querySelector<HTMLElement>(
      '[data-testid="model-selector-trigger"]',
    );
    if (modelTrigger) {
      const parentContainer =
        modelTrigger.closest<HTMLElement>(".no-focus-agent-input")?.parentElement ||
        modelTrigger.parentElement;
      if (parentContainer) {
        return { target: parentContainer, method: "append" };
      }
    }

    // 2. Next to permissions-selector-trigger container (Priority 2)
    const permTrigger = document.querySelector<HTMLElement>(
      '[data-testid="permissions-selector-trigger"]',
    );
    if (permTrigger?.parentElement) {
      return { target: permTrigger.parentElement, method: "append" };
    }

    // 3. Composer footer / root container (Priority 3)
    const composerRoot =
      document.querySelector<HTMLElement>("[data-agent-composer-root]") ||
      document.querySelector<HTMLElement>(".agy-composer-footer") ||
      document.querySelector<HTMLElement>('[data-testid="agent-input-box"]');
    if (composerRoot) {
      return { target: composerRoot, method: "append" };
    }

    // 4. Conversation view bottom composer wrapper (Priority 4)
    const convView = document.querySelector<HTMLElement>('[data-testid="conversation-view"]');
    if (convView?.lastElementChild) {
      return { target: convView.lastElementChild as HTMLElement, method: "append" };
    }

    return null;
  };

  const tryAttach = () => {
    if (unmounted || element.getAttribute("data-agy-unmounted") === "true") return;
    const best = getBestTarget();
    if (!best) return;

    if (element.parentElement === best.target && element.isConnected) {
      return;
    }

    if (best.method === "prepend") {
      best.target.insertBefore(element, best.target.firstChild);
    } else {
      best.target.appendChild(element);
    }
  };

  tryAttach();

  if (typeof MutationObserver !== "undefined") {
    const root =
      document.querySelector('[data-testid="conversation-view"]') ||
      document.body ||
      document.documentElement;
    if (root) {
      observer = new MutationObserver(() => {
        if (unmounted) return;
        tryAttach();
      });
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  return () => {
    if (unmounted) return;
    unmounted = true;
    element.setAttribute("data-agy-unmounted", "true");
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    element.remove();
  };
}

/**
 * Mounts an element into an overlay container `#agy-hud-container`
 * (fixed, pointer-events: none on container, pointer-events: auto on element, z-index: 9999).
 * Returns an unmount function that removes the element and cleans up the container if empty.
 */
export function mountFloatingHUD(element: HTMLElement, options?: HUDOptions): () => void {
  const position = options?.position || "top-right";
  let unmounted = false;

  let container = document.getElementById("agy-hud-container") as HTMLElement | null;
  if (!container) {
    container = document.createElement("div");
    container.id = "agy-hud-container";
    container.style.position = "fixed";
    container.style.pointerEvents = "none";
    container.style.zIndex = "9999";
    container.style.top = "0";
    container.style.left = "0";
    container.style.right = "0";
    container.style.bottom = "0";

    const root = document.body || document.documentElement;
    if (root) {
      root.appendChild(container);
    }
  }

  let slot = container.querySelector<HTMLElement>(`[data-hud-position="${position}"]`);
  if (!slot) {
    slot = document.createElement("div");
    slot.setAttribute("data-hud-position", position);

    let slotCss = "position: absolute; display: flex; gap: 8px; pointer-events: none;";
    switch (position) {
      case "top-left":
        slotCss += " top: 16px; left: 16px; flex-direction: column; align-items: flex-start;";
        break;
      case "bottom-right":
        slotCss +=
          " bottom: 16px; right: 16px; flex-direction: column-reverse; align-items: flex-end;";
        break;
      case "bottom-left":
        slotCss +=
          " bottom: 16px; left: 16px; flex-direction: column-reverse; align-items: flex-start;";
        break;
      default:
        slotCss += " top: 16px; right: 16px; flex-direction: column; align-items: flex-end;";
        break;
    }
    slot.style.cssText = slotCss;
    container.appendChild(slot);
  }

  element.style.pointerEvents = "auto";
  slot.appendChild(element);

  return () => {
    if (unmounted) return;
    unmounted = true;
    element.remove();

    if (slot && (!slot.childNodes || slot.childNodes.length === 0)) {
      slot.remove();
    }

    if (container && (!container.childNodes || container.childNodes.length === 0)) {
      container.remove();
    }
  };
}

/**
 * Observes [data-testid="conversation-view"] or document body for new conversation
 * message additions and triggers callback.
 * Returns disconnect function.
 */
export function observeConversation(callback: (node: HTMLElement) => void): () => void {
  let disconnected = false;
  let activeConv: HTMLElement | null = null;
  let convObserver: MutationObserver | null = null;
  let docObserver: MutationObserver | null = null;

  const handleAddedNode = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    if (el.getAttribute?.("data-testid") === "composer") return;
    if (
      el.id === "child-1-composer" ||
      el.id === "agy-hud-container" ||
      el.id === "agy-header-dock"
    )
      return;
    if (el.closest?.('[data-testid="composer"]')) return;
    try {
      callback(el);
    } catch {}
  };

  const handleMutations = (mutations: MutationRecord[]) => {
    if (disconnected) return;
    for (const mutation of mutations) {
      if (!mutation.addedNodes) continue;
      for (const node of mutation.addedNodes) {
        handleAddedNode(node);
      }
    }
  };

  const syncTarget = () => {
    if (disconnected) return;
    const current = document.querySelector<HTMLElement>('[data-testid="conversation-view"]');
    if (current) {
      if (activeConv !== current) {
        if (convObserver) {
          convObserver.disconnect();
          convObserver = null;
        }
        activeConv = current;
        if (typeof MutationObserver !== "undefined") {
          convObserver = new MutationObserver(handleMutations);
          convObserver.observe(current, { childList: true, subtree: true });
        }
      }
    } else {
      if (convObserver) {
        convObserver.disconnect();
        convObserver = null;
      }
      activeConv = null;
    }
  };

  syncTarget();

  if (typeof MutationObserver !== "undefined") {
    const root = document.body || document.documentElement;
    if (root) {
      docObserver = new MutationObserver((mutations) => {
        if (disconnected) return;
        syncTarget();
        if (!activeConv) {
          handleMutations(mutations);
        }
      });
      docObserver.observe(root, { childList: true, subtree: true });
    }
  }

  return () => {
    disconnected = true;
    if (convObserver) {
      convObserver.disconnect();
      convObserver = null;
    }
    if (docObserver) {
      docObserver.disconnect();
      docObserver = null;
    }
    activeConv = null;
  };
}

export interface LayoutDiagnostics {
  readonly conversationViewPresent: boolean;
  readonly inlineDisplay: string;
  readonly computedFlex: string;
  readonly child0Height: number;
  readonly child1Height: number;
  readonly isClean: boolean;
}

/**
 * Returns an immutable snapshot of Antigravity conversation layout health.
 * Evaluated on-demand with zero continuous reflow overhead.
 */
export function getLayoutDiagnostics(): Readonly<LayoutDiagnostics> {
  const conv =
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>('[data-testid="conversation-view"]');

  const conversationViewPresent = Boolean(conv);
  const inlineDisplay = conv?.style?.display || "";

  let computedFlex = "";
  if (conv) {
    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      try {
        const cs = window.getComputedStyle(conv);
        computedFlex = cs.getPropertyValue("display") || cs.display || "";
      } catch {}
    }
    if (!computedFlex) {
      if (conv.style?.display) {
        computedFlex = conv.style.display;
      } else if (
        conv.classList &&
        typeof conv.classList.contains === "function" &&
        conv.classList.contains("flex")
      ) {
        computedFlex = "flex";
      }
    }
  }

  const child0 =
    conv?.children && conv.children.length > 0 ? (conv.children[0] as HTMLElement) : null;
  const child1 =
    conv?.children && conv.children.length > 1 ? (conv.children[1] as HTMLElement) : null;

  const child0Height = child0 ? Number(child0.clientHeight) || 0 : 0;
  const child1Height = child1 ? Number(child1.clientHeight) || 0 : 0;

  const isClean = Boolean(
    conversationViewPresent &&
      inlineDisplay !== "block" &&
      computedFlex === "flex" &&
      !(child0Height === 0 && child1Height > 0),
  );

  return Object.freeze({
    conversationViewPresent,
    inlineDisplay,
    computedFlex,
    child0Height,
    child1Height,
    isClean,
  });
}
