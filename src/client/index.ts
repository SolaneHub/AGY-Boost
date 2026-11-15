// AGY Boost v0.0.0 - Native Pure TypeScript Runtime

import { loadWasm } from "./wasm/loader.js";
import { DaemonBridge } from "./bridge/daemon.js";
import { mountSidebarButton } from "./ui/sidebar.js";
import { openModsView, closeModsView, isModsViewOpen } from "./ui/mods-view.js";
import { el } from "./ui/dom.js";
import { injectCSS, setTheme, observe, syncModStyles } from "./ui/theme.js";
import { syncModScripts } from "./ui/mods-runner.js";
import {
  mountHeader,
  mountComposer,
  mountFloatingHUD,
  registerShortcut,
  observeConversation,
} from "./ui/slots.js";

const bridge = new DaemonBridge();

export const AGYBoost = {
  version: "0.0.0",
  wasm: {
    load: loadWasm,
  },
  daemon: bridge,
  ui: {
    el,
    injectCSS,
    setTheme,
    observe,
    syncModStyles: () => syncModStyles(bridge),
    syncModScripts: () => syncModScripts(bridge),
    openModsView: () => openModsView(bridge),
    closeModsView,
    isModsViewOpen,
    mountHeader,
    mountComposer,
    mountFloatingHUD,
    registerShortcut,
    observeConversation,
  },
};

// Expose globally on window
(globalThis as any).AGYBoost = AGYBoost;

function initRuntime(): void {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if ((root && root.dataset.agyBoostLoaded === "true") || (globalThis as any).__AGY_BOOST_INITIALIZED__) {
    return;
  }
  if (root) {
    root.dataset.agyBoostLoaded = "true";
  }
  (globalThis as any).__AGY_BOOST_INITIALIZED__ = true;

  enforceConversationLayoutInvariant();
  mountSidebarButton(bridge);
  syncModStyles(bridge).catch(() => {});
  syncModScripts(bridge).catch(() => {});
}

// Defensive observer on [data-testid="conversation-view"] to enforce layout invariant
function enforceConversationLayoutInvariant(): void {
  const sanitizeDisplay = (el: HTMLElement) => {
    if (el.style.display === "block") {
      el.style.display = "";
    }
  };

  let targetObserver: MutationObserver | null = null;
  let mountObserver: MutationObserver | null = null;
  let pendingMountRaf = 0;

  const attachToElement = (conv: HTMLElement) => {
    if (mountObserver) {
      mountObserver.disconnect();
      mountObserver = null;
    }
    if (pendingMountRaf) {
      cancelAnimationFrame(pendingMountRaf);
      pendingMountRaf = 0;
    }

    sanitizeDisplay(conv);

    targetObserver?.disconnect();
    targetObserver = new MutationObserver(() => {
      if (!conv.isConnected) {
        targetObserver?.disconnect();
        targetObserver = null;
        waitForMount();
        return;
      }
      sanitizeDisplay(conv);
    });

    targetObserver.observe(conv, {
      attributes: true,
      attributeFilter: ["style"],
    });

    if (conv.parentElement) {
      targetObserver.observe(conv.parentElement, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }
  };

  const checkMount = () => {
    pendingMountRaf = 0;
    const conv = document.querySelector('[data-testid="conversation-view"]') as HTMLElement | null;
    if (conv) {
      attachToElement(conv);
    }
  };

  const scheduleCheckMount = () => {
    if (!pendingMountRaf) {
      pendingMountRaf = requestAnimationFrame(checkMount);
    }
  };

  const waitForMount = () => {
    const conv = document.querySelector('[data-testid="conversation-view"]') as HTMLElement | null;
    if (conv) {
      attachToElement(conv);
      return;
    }

    if (!mountObserver) {
      mountObserver = new MutationObserver(scheduleCheckMount);
      mountObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  };

  waitForMount();
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRuntime);
} else {
  initRuntime();
}
