// AGY Boost Marketplace Catalog (Typed & Normalized)

export interface MarketplaceCommand {
  name: string;
  description: string;
}

export interface MarketplaceMod {
  id: string;
  name: string;
  category: "compute" | "theme" | "sidecar";
  badges: string[];
  description: string;
  iconBg: string;
  iconSvg: string;
  version?: string;
  author?: string;
  runtime?: string;
  prompts?: string[];
  commands?: MarketplaceCommand[];
  readme?: string;
}

export const MARKETPLACE_CATALOG: MarketplaceMod[] = [
  // High-Performance Compute & Optimizers
  {
    id: "effort-optimizer",
    name: "Effort Optimizer",
    category: "compute",
    badges: ["WASM", "GO", "OFFICIAL"],
    description: "Fine-tune AI reasoning depth and token budgets in real-time. Control inference effort levels directly from your composer to balance response speed and analytical quality.",
    iconBg: "bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
    version: "1.0.0",
    author: "AGY Boost Team",
    runtime: "WASM / Pure TypeScript Engine",
    prompts: [
      "Set inference effort to maximum for this deep architecture review",
      "Optimize token reasoning budget to fast for quick prototyping",
      "Show current inference parameters and token budget consumption",
    ],
    commands: [
      {
        name: "/effort-optimizer",
        description: "Fine-tune AI reasoning depth and token budgets in real-time. Control inference effort levels directly from your composer to balance response speed and analytical quality.",
      },
      {
        name: "/effort-preset",
        description: "Quick-switch reasoning depth between minimal, balanced, deep, and maximum reasoning effort presets.",
      },
    ],
    readme: `### Overview
Effort Optimizer gives you fine-grained control over Gemini and LLM reasoning depth directly within the Antigravity composer. Dynamically scale the model's internal thinking budget from lightweight rapid-response modes to exhaustive multi-step analytical reasoning.

### Key Features
- **Live Token Budgeting**: Real-time control of reasoning budgets per prompt without restarting the session.
- **Adaptive Presets**: Instant switching between minimal (rapid code completions), balanced (daily tasks), and maximum (in-depth system audits and algorithmic reasoning).
- **Zero-Latency In-Client Hook**: Modifies payload parameters directly within Antigravity's client runtime before dispatching API requests.

### Usage & Shortcuts
Use the composer button docked beside the model selector or trigger /effort-optimizer directly in chat.`,
  },
  {
    id: "stream-accel",
    name: "Stream Accelerator",
    category: "compute",
    badges: ["WASM", "FAST"],
    description: "High-throughput SSE buffer engine that eliminates stream stutter. Optimizes chunk processing and markdown rendering for instant large-scale code generations.",
    iconBg: "bg-gradient-to-br from-blue-500/20 to-cyan-500/10 text-blue-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    version: "1.1.0",
    author: "AGY Boost Team",
    runtime: "WebAssembly Compute Core",
    prompts: [
      "Enable high-throughput SSE stream chunking for code outputs",
      "Run streaming render benchmark across 1,000 tokens",
      "Check current SSE frame render latency and buffer queue",
    ],
    commands: [
      {
        name: "/stream-accel",
        description: "High-throughput SSE buffer engine that eliminates stream stutter. Optimizes chunk processing and markdown rendering for instant large-scale code generations.",
      },
      {
        name: "/stream-stats",
        description: "View frame render rates, chunk batch latencies, and buffer throughput.",
      },
    ],
    readme: `### Overview
Stream Accelerator is a specialized SSE (Server-Sent Events) chunking engine designed for high-density code generation. It aggregates micro-chunks and schedules DOM updates using requestAnimationFrame, eliminating UI stutter during rapid multi-hundred-line code outputs.

### Key Features
- **Micro-Chunk Batching**: Prevents layout thrashing by debouncing high-frequency delta tokens.
- **Optimized Markdown Streaming**: Incrementally parses markdown AST without re-evaluating the full token tree.
- **60 FPS Guarantees**: Keeps Antigravity responsive even during heavy continuous agent responses.

### Architecture
Runs natively in the client runtime with zero external dependencies.`,
  },
  {
    id: "context-compressor",
    name: "AST Context Compressor",
    category: "compute",
    badges: ["WASM"],
    description: "Intelligent syntax tree summarizer that reduces context window footprint by up to 40%. Compresses symbol tables and boilerplate while preserving full semantic precision.",
    iconBg: "bg-gradient-to-br from-purple-500/20 to-indigo-500/10 text-purple-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    version: "1.0.4",
    author: "AGY Boost Team",
    runtime: "WebAssembly AST Parser",
    prompts: [
      "Summarize AST and compress symbol table for the active repository",
      "Analyze token distribution across open context files",
      "Strip boilerplate imports and declarations to minimize prompt footprint",
    ],
    commands: [
      {
        name: "/context-compressor",
        description: "Intelligent syntax tree summarizer that reduces context window footprint by up to 40%. Compresses symbol tables and boilerplate while preserving full semantic precision.",
      },
      {
        name: "/context-stats",
        description: "Show context window breakdown and token savings achieved by AST compression.",
      },
    ],
    readme: `### Overview
AST Context Compressor analyzes loaded source code files and builds a compressed semantic representation before dispatching context to the model. It retains all symbol definitions, types, and function signatures while eliding redundant implementation boilerplate.

### Key Features
- **Up to 40% Token Savings**: Dramatically expands effective context capacity for massive codebases.
- **Tree-Sitter Parsing**: Leverages high-performance WebAssembly grammar parsers for TypeScript, Go, Python, and Rust.
- **Lossless Type Preservation**: All exported interfaces, classes, and function contracts remain 100% intact.

### Performance
Parses 50,000 lines of code in under 12ms via client-side WebAssembly.`,
  },
  {
    id: "vector-cache",
    name: "Vector Embeddings Cache",
    category: "compute",
    badges: ["WASM"],
    description: "Fast in-memory SIMD vector index for local codebases. Enables instant semantic code search, symbol discovery, and relevant context retrieval with zero cloud latency.",
    iconBg: "bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>`,
    version: "0.9.2",
    author: "AGY Boost Team",
    runtime: "SIMD WebAssembly",
    prompts: [
      "Search codebase for all implementations of custom UI overlays",
      "Rebuild in-memory vector index for recent workspace modifications",
      "Find semantically related test suites for current file",
    ],
    commands: [
      {
        name: "/vector-cache",
        description: "Fast in-memory SIMD vector index for local codebases. Enables instant semantic code search, symbol discovery, and relevant context retrieval with zero cloud latency.",
      },
      {
        name: "/vector-index",
        description: "Re-index active workspace symbols and generate vector embeddings.",
      },
    ],
    readme: `### Overview
Vector Embeddings Cache provides local, ultra-low-latency semantic search over your project's symbols and documentation. Uses SIMD-accelerated dot product calculations directly in WebAssembly.

### Key Features
- **100% Local & Private**: No embeddings or code snippets leave your computer.
- **SIMD Acceleration**: Vector cosine similarity scans execute at over 10M vectors per second.
- **Instant Context Slicing**: Automatically retrieves relevant methods and types as the agent formulates answers.`,
  },

  // Willow UI & Visual Themes
  {
    id: "theme-oled",
    name: "OLED Midnight Pure Black",
    category: "theme",
    badges: ["THEME"],
    description: "True pitch-black palette engineered specifically for OLED and high-contrast displays. Replaces dark grays with pure #000000 tones across all Antigravity surfaces.",
    iconBg: "bg-gradient-to-br from-zinc-800 to-black text-zinc-100",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
    version: "1.2.0",
    author: "AGY Boost Design",
    runtime: "CSS Theme Engine",
    prompts: [
      "Enable OLED pure black theme across all Antigravity windows",
      "Switch accent color to Emerald Green on OLED background",
      "Restore standard dark theme colors",
    ],
    commands: [
      {
        name: "/theme-oled",
        description: "True pitch-black palette engineered specifically for OLED and high-contrast displays. Replaces dark grays with pure #000000 tones across all Antigravity surfaces.",
      },
      {
        name: "/theme-accent",
        description: "Customize primary accent colors against the OLED pitch-black background.",
      },
    ],
    readme: `### Overview
A purpose-built high-contrast palette that turns Antigravity's dark grays into pure #000000 pitch black. Perfect for OLED displays, reducing eye fatigue in dark rooms, and maximizing display contrast.

### Key Features
- **True Pitch Black**: Replaces all --background, --sidebar, and surface variables with pure #000000.
- **Enhanced Readability**: Border accents and syntax highlights calibrated for maximum contrast.
- **Zero-Flicker Injection**: Injects CSS variables instantly with no layout redraw delay.`,
  },
  {
    id: "theme-compact",
    name: "Compact Density Mode",
    category: "theme",
    badges: ["THEME", "UI"],
    description: "High-density interface mode with optimized paddings and tighter typography. Maximizes screen real estate for complex multi-file chats and smaller laptop screens.",
    iconBg: "bg-gradient-to-br from-rose-500/20 to-pink-500/10 text-rose-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
    version: "1.0.1",
    author: "AGY Boost Design",
    runtime: "CSS Theme Engine",
    prompts: [
      "Enable high-density compact spacing mode",
      "Optimize message history layout for 13-inch display",
      "Restore default comfortable paddings",
    ],
    commands: [
      {
        name: "/theme-compact",
        description: "High-density interface mode with optimized paddings and tighter typography. Maximizes screen real estate for complex multi-file chats and smaller laptop screens.",
      },
      {
        name: "/density-toggle",
        description: "Toggle between standard, comfortable, and ultra-compact spacing.",
      },
    ],
    readme: `### Overview
Designed for developers working on smaller screens or managing complex multi-turn chats with massive code snippets. Reduces empty margins, shrinks redundant message paddings, and tightens line-heights without sacrificing typography elegance.

### Key Features
- **+35% Visible Code**: Displays significantly more lines of code in the message scroller.
- **Streamlined Sidebar**: Reduces vertical spacing in file tree and chat threads.
- **Fully Non-Destructive**: Easily toggled on or off with a single click.`,
  },
  {
    id: "ui-telemetry",
    name: "Status Bar Telemetry",
    category: "theme",
    badges: ["UI"],
    description: "Live telemetry HUD docked in the window status bar. Monitors token generation speed, round-trip API latency, active reasoning tokens, and local daemon memory usage.",
    iconBg: "bg-gradient-to-br from-amber-500/20 to-yellow-500/10 text-amber-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>`,
    version: "1.0.0",
    author: "AGY Boost Team",
    runtime: "Pure TypeScript Runtime",
    prompts: [
      "Dock telemetry HUD in bottom status bar",
      "Display generation speed in tokens per second",
      "Show memory usage of AGY Boost daemon",
    ],
    commands: [
      {
        name: "/ui-telemetry",
        description: "Live telemetry HUD docked in the window status bar. Monitors token generation speed, round-trip API latency, active reasoning tokens, and local daemon memory usage.",
      },
      {
        name: "/telemetry-reset",
        description: "Reset token throughput counters and latency history graphs.",
      },
    ],
    readme: `### Overview
Provides real-time engineering metrics directly within the Antigravity status bar. Displays live token generation velocity (tokens/sec), network round-trip time (RTT), reasoning tokens generated, and daemon memory consumption.

### Key Features
- **Live Tokens/Sec**: Precise calculation of inference streaming speed.
- **Latency Tracking**: Measures TTFT (Time To First Token) and overall response turnaround.
- **Minimal Overhead**: Uses passive DOM listeners and lightweight performance timers (<0.1% CPU).`,
  },

  // Sidecars & Background Engines
  {
    id: "local-llm-bridge",
    name: "Local LLM Bridge",
    category: "sidecar",
    badges: ["GO", "SIDECAR"],
    description: "Zero-config bridge connecting local Ollama, llama.cpp, LM Studio, and vLLM endpoints directly into Antigravity for private, offline, and hybrid model execution.",
    iconBg: "bg-gradient-to-br from-sky-500/20 to-blue-500/10 text-sky-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
    version: "2.0.0",
    author: "AGY Boost Team",
    runtime: "Native Go Sidecar / Loopback IPC",
    prompts: [
      "Connect to local Ollama instance on port 11434",
      "Route privacy-sensitive prompts to local DeepSeek-R1 or Qwen model",
      "Test latency of local llama.cpp endpoint",
    ],
    commands: [
      {
        name: "/local-llm-bridge",
        description: "Zero-config bridge connecting local Ollama, llama.cpp, LM Studio, and vLLM endpoints directly into Antigravity for private, offline, and hybrid model execution.",
      },
      {
        name: "/local-models",
        description: "List discovered local models on Ollama/llama.cpp ports.",
      },
    ],
    readme: `### Overview
Route Antigravity requests seamlessly to your local models running on Ollama, llama.cpp, LM Studio, or vLLM. Perfect for private workspaces, offline development, or running specialized local weights alongside cloud agents.

### Key Features
- **Zero-Config Discovery**: Auto-detects local running services on standard ports (11434, 8080, 1234).
- **Full Streaming Support**: Maps local SSE streams into Antigravity's native streaming protocol.
- **Hybrid Routing**: Choose which requests run locally and which run in the cloud.`,
  },
  {
    id: "git-worktree",
    name: "Git Worktree Assistant",
    category: "sidecar",
    badges: ["GO", "SIDECAR"],
    description: "Isolated background engine managing simultaneous Git worktrees. Switch branches and test parallel agent solutions without triggering full workspace re-indexing.",
    iconBg: "bg-gradient-to-br from-teal-500/20 to-emerald-500/10 text-teal-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
    version: "1.0.2",
    author: "AGY Boost Team",
    runtime: "Native Go Sidecar Engine",
    prompts: [
      "Create isolated worktree to benchmark agent changes",
      "Sync current workspace with worktree test branch",
      "Prune merged git worktrees",
    ],
    commands: [
      {
        name: "/git-worktree",
        description: "Isolated background engine managing simultaneous Git worktrees. Switch branches and test parallel agent solutions without triggering full workspace re-indexing.",
      },
      {
        name: "/worktree-list",
        description: "List all active worktrees and their branch bindings.",
      },
    ],
    readme: `### Overview
Enables agent experimentation without disrupting your primary workspace. Automatically sets up and manages isolated Git worktrees in the background, allowing parallel branch testing without triggering full workspace re-indexing or rebuild delays.

### Key Features
- **Instant Isolation**: Test proposed refactorings on a separate branch in an isolated folder.
- **Background Management**: Creates, cleans up, and merges worktrees automatically.
- **Zero Antigravity Reload**: Primary workspace files remain untouched until you approve the diff.`,
  },
];

const catalogMap = new Map<string, MarketplaceMod>();
for (const item of MARKETPLACE_CATALOG) {
  catalogMap.set(item.id, item);
}

export function getMarketplaceMod(id: string): MarketplaceMod | undefined {
  return catalogMap.get(id);
}
