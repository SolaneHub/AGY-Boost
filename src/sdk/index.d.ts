/**
 * AGY Boost Mod SDK v0.0.0
 * Native modding platform for Google Antigravity.
 * Powered by Pure TypeScript (UI), WebAssembly (Compute), and Go (Daemons).
 */

export interface ModManifest {
  /** Unique mod identifier, e.g. "my-cool-mod" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version string, e.g. "1.0.0" */
  version: string;
  /** Brief description of what the mod does */
  description?: string;
  /** Author name or GitHub handle */
  author?: string;
  /** Main entry point for UI scripts (e.g. "index.js") */
  main?: string;
  /** Optional custom CSS stylesheet(s) applied automatically when mod is enabled */
  style?: string | string[];
  /** Optional WebAssembly binary for high-performance compute (e.g. "compute.wasm") */
  wasm?: string;
  /** Optional Go native daemon sidecar executable (e.g. "daemon") */
  daemon?: string;
}

/**
 * All native CSS custom properties extracted from Google Antigravity.
 */
export interface AntigravityThemeVariables {
  // Core Surfaces & Colors
  "--background"?: string;
  "--body-background"?: string;
  "--foreground"?: string;
  "--primary"?: string;
  "--primary-foreground"?: string;
  "--secondary"?: string;
  "--secondary-foreground"?: string;
  "--muted"?: string;
  "--muted-foreground"?: string;
  "--border"?: string;
  "--card"?: string;
  "--card-border"?: string;
  "--card-radius"?: string;
  "--link"?: string;
  "--cta"?: string;
  "--cta-foreground"?: string;
  "--glass"?: string;
  "--glass-border"?: string;
  "--glass-highlight"?: string;
  "--glass-shadow"?: string;
  "--scrim"?: string;

  // Sidebar
  "--sidebar"?: string;
  "--color-sidebar"?: string;
  "--sidebar-secondary"?: string;
  "--sidebar-muted"?: string;
  "--sidebar-width"?: string;

  // Feedback & States
  "--success"?: string;
  "--warning"?: string;
  "--error"?: string;
  "--focus-ring-color"?: string;
  "--focus-ring-offset-color"?: string;
  "--bg-selection"?: string;
  "--bg-selection-overlay"?: string;
  "--bg-cursor-line"?: string;
  "--fg-cursor"?: string;

  // Code & Syntax Highlighting
  "--syntax-keyword"?: string;
  "--syntax-string"?: string;
  "--syntax-function"?: string;
  "--syntax-variable"?: string;
  "--syntax-number"?: string;
  "--syntax-comment"?: string;
  "--syntax-constant"?: string;
  "--syntax-operator"?: string;
  "--syntax-property"?: string;
  "--syntax-punctuation"?: string;
  "--syntax-tag"?: string;
  "--syntax-builtin"?: string;
  "--syntax-class-name"?: string;
  "--syntax-attr-name"?: string;
  "--syntax-attr-value"?: string;
  "--syntax-deleted"?: string;
  "--syntax-inserted"?: string;
  "--syntax-default-fg"?: string;
  "--code-foreground"?: string;

  // Allow custom arbitrary variables
  [customVar: `--${string}`]: string | undefined;
}

export interface ModWasm {
  /**
   * Load and instantiate a WebAssembly binary natively.
   * Supports streaming compilation and direct ArrayBuffer/Uint8Array loading.
   */
  load<Exports extends WebAssembly.Exports = WebAssembly.Exports>(
    binaryOrUrl: string | ArrayBuffer | Uint8Array,
    imports?: WebAssembly.Imports
  ): Promise<WebAssembly.Instance & { exports: Exports }>;
}

export interface ModDaemon {
  /**
   * Check if the native Go daemon is running.
   */
  isHealthy(): Promise<boolean>;

  /**
   * Spawn a native Go background sidecar for this mod.
   */
  spawn(binaryPath: string, args?: string[]): Promise<{ ok: boolean; pid?: number }>;

  /**
   * Terminate the running background daemon.
   */
  kill(): Promise<boolean>;
}

export interface ModUI {
  /**
   * Zero-framework DOM element builder matching Antigravity's Willow Design System.
   */
  el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string | number | boolean | undefined | null | ((e: any) => void)>,
    children?: (Node | string | null | undefined)[]
  ): HTMLElementTagNameMap[K];

  /**
   * Injects CSS rules directly into document.head.
   * Returns a cleanup function that removes the injected style element.
   */
  injectCSS(css: string): () => void;

  /**
   * Sets Antigravity theme CSS variables on the root document.
   * Returns a cleanup function that restores previous variable values.
   */
  setTheme(variables: AntigravityThemeVariables | Record<string, string>): () => void;

  /**
   * Synchronize and inject stylesheet files for all currently enabled mods.
   */
  syncModStyles?(): Promise<void>;

  /**
   * Watches the DOM for elements matching selector as they appear dynamically.
   * Returns an unobserve function to disconnect the observer.
   */
  observe(selector: string, callback: (element: HTMLElement) => void): () => void;

  /**
   * Open the AGY Boost mods management panel.
   */
  openModsView(): void;

  /**
   * Close the AGY Boost mods management panel.
   */
  closeModsView(): void;
}

export interface ModContext {
  readonly manifest: ModManifest;
  readonly wasm: ModWasm;
  readonly daemon: ModDaemon;
  readonly ui: ModUI;
  /**
   * Register a teardown callback invoked when the mod is disabled or reloaded.
   */
  onDispose(cleanup: () => void): void;
}

export interface AGYBoostGlobal {
  readonly version: string;
  readonly wasm: ModWasm;
  readonly daemon: ModDaemon;
  readonly ui: ModUI;
}

declare global {
  const AGYBoost: AGYBoostGlobal;
  const mod: ModContext;
}
