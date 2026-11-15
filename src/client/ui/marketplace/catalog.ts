// AGY Boost Marketplace Catalog (Typed & Normalized)

export interface MarketplaceMod {
  id: string;
  name: string;
  category: "compute" | "theme" | "sidecar";
  badges: string[];
  description: string;
  iconBg: string;
  iconSvg: string;
}

export const MARKETPLACE_CATALOG: MarketplaceMod[] = [
  // High-Performance Compute & Optimizers
  {
    id: "effort-optimizer",
    name: "Effort Optimizer",
    category: "compute",
    badges: ["WASM", "GO", "OFFICIAL"],
    description: "Dynamic token stream reasoning budget tuner. Optimizes Claude & Gemini inference effort in real-time.",
    iconBg: "bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  },
  {
    id: "stream-accel",
    name: "Stream Accelerator",
    category: "compute",
    badges: ["WASM", "FAST"],
    description: "High-throughput Server-Sent Events buffer manager for instantaneous large code generations.",
    iconBg: "bg-gradient-to-br from-blue-500/20 to-cyan-500/10 text-blue-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  },
  {
    id: "context-compressor",
    name: "AST Context Compressor",
    category: "compute",
    badges: ["WASM"],
    description: "Lossless AST and symbol summarization reducing context window footprint by up to 40%.",
    iconBg: "bg-gradient-to-br from-purple-500/20 to-indigo-500/10 text-purple-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  },
  {
    id: "vector-cache",
    name: "Vector Embeddings Cache",
    category: "compute",
    badges: ["WASM"],
    description: "Embedded SIMD vector index for local code semantic search and instant symbol discovery.",
    iconBg: "bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>`,
  },

  // Willow UI & Visual Themes
  {
    id: "theme-oled",
    name: "OLED Midnight Pure Black",
    category: "theme",
    badges: ["THEME"],
    description: "True pure pitch-black palette engineered for OLED displays with Willow styling.",
    iconBg: "bg-gradient-to-br from-zinc-800 to-black text-zinc-100",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  },
  {
    id: "theme-compact",
    name: "Compact Density Mode",
    category: "theme",
    badges: ["THEME", "UI"],
    description: "Optimized workspace spacing and tighter paddings designed for high-DPI displays.",
    iconBg: "bg-gradient-to-br from-rose-500/20 to-pink-500/10 text-rose-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
  },
  {
    id: "ui-telemetry",
    name: "Status Bar Telemetry",
    category: "theme",
    badges: ["UI"],
    description: "Real-time token generation speed, round-trip latency, and daemon memory telemetry in the window footer.",
    iconBg: "bg-gradient-to-br from-amber-500/20 to-yellow-500/10 text-amber-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>`,
  },

  // Sidecars & Background Engines
  {
    id: "local-llm-bridge",
    name: "Local LLM Bridge",
    category: "sidecar",
    badges: ["GO", "SIDECAR"],
    description: "Direct zero-config bridge connecting local Ollama, llama.cpp, and vLLM endpoints to Antigravity.",
    iconBg: "bg-gradient-to-br from-sky-500/20 to-blue-500/10 text-sky-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
  },
  {
    id: "git-worktree",
    name: "Git Worktree Assistant",
    category: "sidecar",
    badges: ["GO", "SIDECAR"],
    description: "Background engine managing instant multi-branch worktrees without triggering full project re-indexing.",
    iconBg: "bg-gradient-to-br from-teal-500/20 to-emerald-500/10 text-teal-400",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  },
];

const catalogMap = new Map<string, MarketplaceMod>();
for (const item of MARKETPLACE_CATALOG) {
  catalogMap.set(item.id, item);
}

export function getMarketplaceMod(id: string): MarketplaceMod | undefined {
  return catalogMap.get(id);
}
