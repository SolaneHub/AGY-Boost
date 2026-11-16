/**
 * AGY Boost Mod SDK v0.1.0
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
   * Retrieve list of installed mods and their status from the daemon.
   */
  getMods(): Promise<ModManifest[]>;

  /**
   * Enable or disable a specific mod.
   */
  toggleMod(id: string, enabled: boolean): Promise<boolean>;

  /**
   * Read a text file from a mod's directory via daemon.
   */
  getModFile(id: string, file: string): Promise<string | null>;

  /**
   * Opens the mods directory in the native file manager (Finder / Explorer)
   * and returns the folder path.
   */
  openModsFolder(): Promise<{ ok: boolean; path?: string }>;

  /**
   * Spawn a native Go background sidecar for this mod (or global).
   */
  spawn(binaryPath: string, args?: string[]): Promise<{ ok: boolean; pid?: number }>;

  /**
   * Spawn a native Go background sidecar with an explicit modId.
   */
  spawnDaemon(
    modId: string,
    binaryPath: string,
    args?: string[]
  ): Promise<{ ok: boolean; pid?: number }>;

  /**
   * Terminate the running background daemon (or specific modId).
   */
  kill(modId?: string): Promise<boolean>;

  /**
   * Terminate a specific mod's running background daemon.
   */
  killDaemon(modId: string): Promise<boolean>;
}

export type HUDPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export interface HUDOptions {
  /**
   * Screen corner position for the floating HUD overlay.
   * Defaults to "top-right".
   */
  position?: HUDPosition;
}

export type DOMEventHandler = {
  bivariance(event: Event): unknown;
}["bivariance"];

export interface ModUI {
  /**
   * Zero-framework DOM element builder matching Antigravity's Willow Design System.
   */
  el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string | number | boolean | undefined | null | DOMEventHandler>,
    children?: Array<Node | string | null | undefined>
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
   * Synchronize and execute script files for all currently enabled mods.
   */
  syncModScripts?(): Promise<void>;

  /**
   * Watches the DOM for elements matching selector as they appear dynamically.
   * Returns an unobserve function to disconnect the observer.
   */
  observe(selector: string, callback: (element: HTMLElement) => void): () => void;

  /**
   * Mounts an element into Antigravity's top header area or a top-docked bar
   * without affecting [data-testid="conversation-view"] flexbox layout.
   * Returns an unmount function that removes the element.
   */
  mountHeader(element: HTMLElement): () => void;

  /**
   * Mounts an element into the chat composer toolbar (next to model and permission selectors)
   * without affecting conversation view layout, and maintains attachment across chat navigation.
   * Returns an unmount function that removes the element.
   */
  mountComposer?(element: HTMLElement): () => void;

  /**
   * Mounts an element into an overlay container `#agy-hud-container` (fixed, pointer-events: none
   * on container, pointer-events: auto on element, z-index: 9999).
   * Returns an unmount function that removes the element and cleans up the container if empty.
   */
  mountFloatingHUD(element: HTMLElement, options?: HUDOptions): () => void;

  /**
   * Registers a global keyboard shortcut (e.g. "Cmd+Shift+M", "Ctrl+Shift+M", "Alt+T").
   * Normalizes Cmd (Meta) on Mac and Ctrl on Windows/Linux.
   * Returns an unregister function to remove the shortcut listener.
   */
  registerShortcut(combo: string, handler: (e: KeyboardEvent) => void): () => void;

  /**
   * Observes [data-testid="conversation-view"] or document body for new conversation
   * message additions and triggers callback.
   * Returns a disconnect function to stop observing.
   */
  observeConversation(callback: (node: HTMLElement) => void): () => void;

  /**
   * Open the AGY Boost mods management panel.
   */
  openModsView(): void;

  /**
   * Close the AGY Boost mods management panel.
   */
  closeModsView(): void;
}

export interface DiagnosticEntry {
  timestamp: number;
  level: "INFO" | "WARN" | "ERROR" | "METRIC";
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ModDiagnostics {
  /**
   * Records a diagnostic event into the in-memory circular FIFO ring buffer (capacity: 100).
   */
  record(
    level: DiagnosticEntry["level"],
    source: string,
    message: string,
    details?: Record<string, unknown>
  ): DiagnosticEntry;

  /**
   * Retrieves an immutable snapshot of all recorded diagnostic entries.
   */
  getEntries(): readonly DiagnosticEntry[];

  /**
   * Clears all recorded diagnostic entries in the ring buffer.
   */
  clear(): void;
}

export interface ModContext {
  readonly manifest: ModManifest;
  readonly wasm: ModWasm;
  readonly daemon: ModDaemon;
  readonly ui: ModUI;
  readonly diagnostics?: ModDiagnostics;
  /**
   * Register a teardown callback invoked when the mod is disabled or reloaded.
   */
  onDispose(cleanup: () => void): void;
}

export interface AGYBoostGlobal {
  readonly version: string;
  readonly wasm: ModWasm;
  readonly daemon: ModDaemon;
  readonly diagnostics: ModDiagnostics;
  readonly ui: ModUI;
}

declare global {
  const AGYBoost: AGYBoostGlobal;
  const mod: ModContext;
  const __AGY_DIAGNOSTICS__: ModDiagnostics;
}
