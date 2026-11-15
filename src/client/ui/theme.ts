// AGY Boost Theming & Styling Engine

import { DaemonBridge } from "../bridge/daemon.js";

const appliedModStyles = new Map<string, () => void>();

export async function syncModStyles(bridge: DaemonBridge): Promise<void> {
  const mods = await bridge.getMods();
  const currentActiveIds = new Set<string>();

  for (const mod of mods) {
    if (!mod.enabled || !mod.style) continue;
    currentActiveIds.add(mod.id);

    if (appliedModStyles.has(mod.id)) continue;

    const styles = Array.isArray(mod.style) ? mod.style : [mod.style];
    const cleanups: Array<() => void> = [];

    for (const styleFile of styles) {
      if (typeof styleFile !== "string") continue;
      const css = await bridge.getModFile(mod.id, styleFile);
      if (css) {
        cleanups.push(injectCSS(css));
      }
    }

    if (cleanups.length > 0) {
      appliedModStyles.set(mod.id, () => {
        for (const cleanup of cleanups) cleanup();
      });
    }
  }

  for (const [modId, cleanup] of appliedModStyles.entries()) {
    if (!currentActiveIds.has(modId)) {
      cleanup();
      appliedModStyles.delete(modId);
    }
  }
}

export function injectCSS(css: string): () => void {
  const style = document.createElement("style");
  style.setAttribute("data-agy-boost-theme", "true");
  style.textContent = css;

  const mount = () => {
    (document.head || document.documentElement).appendChild(style);
  };

  if (document.head || document.documentElement) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }

  return () => {
    style.remove();
  };
}

export function setTheme(variables: Record<string, string>): () => void {
  const root = document.documentElement;
  const previousValues = new Map<string, string>();

  for (const [key, value] of Object.entries(variables)) {
    if (!key.startsWith("--")) continue;
    previousValues.set(key, root.style.getPropertyValue(key));
    root.style.setProperty(key, value);
  }

  return () => {
    for (const [key, prev] of previousValues.entries()) {
      if (prev) {
        root.style.setProperty(key, prev);
      } else {
        root.style.removeProperty(key);
      }
    }
  };
}

export function observe(selector: string, callback: (element: HTMLElement) => void): () => void {
  const seen = new WeakSet<HTMLElement>();
  let pendingRaf = 0;

  const check = () => {
    pendingRaf = 0;
    const matches = document.querySelectorAll<HTMLElement>(selector);
    for (const el of Array.from(matches)) {
      if (!seen.has(el)) {
        seen.add(el);
        try {
          callback(el);
        } catch {}
      }
    }
  };

  const scheduleCheck = () => {
    if (!pendingRaf) {
      pendingRaf = requestAnimationFrame(check);
    }
  };

  // Run on already mounted elements
  check();

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  return () => {
    if (pendingRaf) {
      cancelAnimationFrame(pendingRaf);
      pendingRaf = 0;
    }
    observer.disconnect();
  };
}
