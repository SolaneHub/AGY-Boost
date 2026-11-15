// AGY Boost Mod Script Lifecycle Runner
// Willow Design System & Zero-framework runtime integration.
// Strictly adheres to AGENTS.md (no console logging, flexbox invariants).

import { DaemonBridge, ModInfo } from "../bridge/daemon.js";

export type CleanupFn = () => void;

export interface ModScriptContext {
  manifest: ModInfo;
  wasm: any;
  daemon: DaemonBridge;
  ui: any;
  cleanup: (fn: CleanupFn) => void;
  onDispose: (fn: CleanupFn) => void;
}

const globalObj = globalThis as any;
const activeModCleanups: Map<string, CleanupFn[]> =
  globalObj.__AGY_ACTIVE_MOD_CLEANUPS__ || (globalObj.__AGY_ACTIVE_MOD_CLEANUPS__ = new Map<string, CleanupFn[]>());

/**
 * Unloads and executes all registered cleanup callbacks for a specific mod.
 */
export function unloadModScript(modId: string): void {
  const cleanups = activeModCleanups.get(modId);
  if (cleanups) {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {}
    }
    activeModCleanups.delete(modId);
  }

  // Defensive DOM cleanup: remove any leftover elements tagged with this mod ID
  if (typeof document !== "undefined") {
    try {
      const leftovers = document.querySelectorAll(`[data-agy-mod-id="${modId}"]`);
      for (let i = 0; i < leftovers.length; i++) {
        leftovers[i].setAttribute("data-agy-unmounted", "true");
        leftovers[i].remove();
      }
    } catch {}
  }
}

/**
 * Reset all active mod scripts (useful for tests or host teardown).
 */
export function resetModScripts(): void {
  for (const modId of Array.from(activeModCleanups.keys())) {
    unloadModScript(modId);
  }
}

/**
 * Returns true if a script for this mod is currently active.
 */
export function isModScriptActive(modId: string): boolean {
  return activeModCleanups.has(modId);
}

/**
 * Synchronize and execute script files for all currently enabled mods.
 * Automatically tracks cleanups and unmounts scripts when mods are disabled.
 */
export async function syncModScripts(bridge: DaemonBridge): Promise<void> {
  let mods: ModInfo[] = [];
  try {
    mods = await bridge.getMods();
  } catch {
    return;
  }

  const currentActiveIds = new Set<string>();

  for (const mod of mods) {
    if (!mod.enabled || !mod.main) continue;
    currentActiveIds.add(mod.id);

    // If script is already executing and tracked, skip re-execution
    if (activeModCleanups.has(mod.id)) continue;

    let code: string | null = null;
    try {
      code = await bridge.getModFile(mod.id, mod.main);
    } catch {
      code = null;
    }

    if (!code || !code.trim()) continue;

    const cleanups: CleanupFn[] = [];
    const registerCleanup = (fn: CleanupFn) => {
      if (typeof fn === "function") {
        cleanups.push(fn);
      }
    };

    const agy = (globalThis as any).AGYBoost;
    const context: ModScriptContext = {
      manifest: mod,
      wasm: agy?.wasm,
      daemon: bridge,
      ui: agy?.ui,
      cleanup: registerCleanup,
      onDispose: registerCleanup,
    };

    try {
      // Normalize ES module 'export default' syntax if present to CommonJS
      let sanitizedCode = code;
      if (/^\s*export\s+default\s+/m.test(sanitizedCode)) {
        sanitizedCode = sanitizedCode.replace(/^\s*export\s+default\s+/m, "module.exports = ");
      }

      const modExports: any = {};
      const moduleObj = { exports: modExports };

      const runner = new Function(
        "context",
        "AGYBoost",
        "module",
        "exports",
        `return (async function (context, AGYBoost, module, exports) {
          ${sanitizedCode}
        })(context, AGYBoost, module, exports);`
      );

      const result = await runner(context, agy, moduleObj, modExports);

      // 1. If module.exports was assigned an entrypoint function, execute it
      if (typeof moduleObj.exports === "function") {
        const exportedResult = await moduleObj.exports(context, agy);
        if (typeof exportedResult === "function") {
          cleanups.push(exportedResult);
        } else if (exportedResult && typeof exportedResult.unmount === "function") {
          cleanups.push(() => exportedResult.unmount());
        } else if (exportedResult && typeof exportedResult.cleanup === "function") {
          cleanups.push(() => exportedResult.cleanup());
        }
      } else if (moduleObj.exports && typeof moduleObj.exports.unmount === "function") {
        cleanups.push(() => moduleObj.exports.unmount());
      } else if (moduleObj.exports && typeof moduleObj.exports.cleanup === "function") {
        cleanups.push(() => moduleObj.exports.cleanup());
      }

      // 2. If the script directly returned a cleanup function or unmount object
      if (typeof result === "function" && result !== moduleObj.exports) {
        cleanups.push(result);
      } else if (result && typeof result.unmount === "function" && result !== moduleObj.exports) {
        cleanups.push(() => result.unmount());
      } else if (result && typeof result.cleanup === "function" && result !== moduleObj.exports) {
        cleanups.push(() => result.cleanup());
      } else if (result && typeof result.dispose === "function" && result !== moduleObj.exports) {
        cleanups.push(() => result.dispose());
      }

      activeModCleanups.set(mod.id, cleanups);
    } catch {
      // Silently catch error to protect host stability (no console.error in runtime)
      for (const fn of cleanups) {
        try {
          fn();
        } catch {}
      }
    }
  }

  // Unload any mods that are explicitly disabled
  for (const mod of mods) {
    if (!mod.enabled) {
      unloadModScript(mod.id);
    }
  }

  // Unload any mods that are no longer present or no longer active
  for (const modId of Array.from(activeModCleanups.keys())) {
    if (!currentActiveIds.has(modId)) {
      unloadModScript(modId);
    }
  }
}
