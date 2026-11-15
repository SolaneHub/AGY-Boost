// AGY Boost Mods View (100% Willow Design System Parity, Pure TypeScript)

import { el, createSvgIcon } from "./dom.js";
import { DaemonBridge } from "../bridge/daemon.js";
import { syncModStyles } from "./theme.js";
import { syncModScripts } from "./mods-runner.js";
import { updateSidebarActiveState } from "./sidebar.js";
import { MARKETPLACE_CATALOG } from "./marketplace/catalog.js";
import { renderSpotlightHost, stopSpotlightTimer } from "./marketplace/spotlight.js";
import { renderModDetail } from "./marketplace/mod-detail.js";

type TabType = "installed" | "marketplace";

let activeModsView: HTMLElement | null = null;
let activeScrollContainer: HTMLElement | null = null;
let activeBridge: DaemonBridge | null = null;
let selectedModId: string | null = null;
let selectedModSource: TabType = "marketplace";
const hiddenSiblings = new Map<HTMLElement, string>();
const hiddenHeaderElements = new Map<HTMLElement, string>();
let headerObserver: MutationObserver | null = null;
let currentTab: TabType = "marketplace";
let searchQuery = "";
let installedModsCollapsed = false;
let skillsRulesCollapsed = false;
let customAgentsCollapsed = false;
let mcpServersCollapsed = false;
let platformEnginesCollapsed = false;

export function isModsViewOpen(): boolean {
  return activeModsView !== null && document.body.contains(activeModsView);
}

function hideChatHeaderItems(): void {
  const header = document.querySelector('[data-main-content-header="true"]');
  if (!header) return;

  // 1. Left cluster (breadcrumbs, project worktree, conversation title)
  const leftCluster = header.querySelector<HTMLElement>(
    ".agy-layout-vars.flex.items-center.gap-1.min-w-0.pl-2"
  );
  if (leftCluster) {
    for (const child of Array.from(leftCluster.children)) {
      if (child instanceof HTMLElement && child.style.display !== "none") {
        if (!hiddenHeaderElements.has(child)) {
          hiddenHeaderElements.set(child, child.style.display || "");
        }
        child.style.display = "none";
      }
    }
  }

  // 2. Right cluster (pane toolbar icons, chat more actions, overview panel)
  const rightToolbar = header.querySelector<HTMLElement>('[data-testid="pane-titlebar-toolbar"]');
  if (rightToolbar) {
    for (const child of Array.from(rightToolbar.children)) {
      if (child instanceof HTMLElement && child.style.display !== "none") {
        if (!hiddenHeaderElements.has(child)) {
          hiddenHeaderElements.set(child, child.style.display || "");
        }
        child.style.display = "none";
      }
    }
  }

  // 3. Fallback direct breadcrumbs segment check
  const breadcrumbs = header
    .querySelector<HTMLElement>('[data-testid="breadcrumb-segment"]')
    ?.closest<HTMLElement>(".flex.items-center.min-w-0");
  if (breadcrumbs && breadcrumbs.style.display !== "none") {
    if (!hiddenHeaderElements.has(breadcrumbs)) {
      hiddenHeaderElements.set(breadcrumbs, breadcrumbs.style.display || "");
    }
    breadcrumbs.style.display = "none";
  }

  // 4. Side view / auxiliary sidebar button in top-right corner ([data-testid="toggle-aux-sidebar"])
  const auxToggle = document.querySelector<HTMLElement>('[data-testid="toggle-aux-sidebar"]');
  if (auxToggle) {
    const auxContainer = auxToggle.closest<HTMLElement>(".absolute.right-0.z-50") || auxToggle;
    if (auxContainer.style.display !== "none") {
      if (!hiddenHeaderElements.has(auxContainer)) {
        hiddenHeaderElements.set(auxContainer, auxContainer.style.display || "");
      }
      auxContainer.style.display = "none";
    }
  }
}

export function openModsView(bridge: DaemonBridge): void {
  currentTab = "marketplace";
  searchQuery = "";
  // Defensively clean up any lingering instances
  for (const old of Array.from(document.querySelectorAll("#agy-boost-mods-view"))) {
    old.remove();
  }
  activeModsView = null;

  const mainViewport = getMainViewportContainer();
  if (!mainViewport) return;

  // Safely hide all existing siblings inside main viewport container
  hiddenSiblings.clear();
  for (const child of Array.from(mainViewport.children)) {
    if (child instanceof HTMLElement) {
      hiddenSiblings.set(child, child.style.display || "");
      child.dataset.agyBoostHidden = child.style.display || "";
      child.style.display = "none";
    }
  }

  // Hide chat-specific titlebar header items (breadcrumbs, worktree, chat toolbar icons, side view button)
  hiddenHeaderElements.clear();
  hideChatHeaderItems();

  if (headerObserver) headerObserver.disconnect();
  headerObserver = new MutationObserver(() => {
    if (isModsViewOpen()) {
      hideChatHeaderItems();
    }
  });
  headerObserver.observe(document.body, { childList: true, subtree: true });

  // Shell identical to Customizations
  const view = el("div", {
    id: "agy-boost-mods-view",
    class: "flex-1 flex flex-col overflow-hidden h-full min-h-0 bg-background",
  });

  const scrollContainer = el("div", {
    class: "flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]",
  });

  view.appendChild(scrollContainer);

  // Render complete Customizations-parity view
  renderView(scrollContainer, bridge);

  mainViewport.appendChild(view);
  activeModsView = view;
  updateSidebarActiveState(true);
}

export function openModDetail(modId: string, source: TabType = "marketplace"): void {
  stopSpotlightTimer();
  selectedModId = modId;
  selectedModSource = source;
  if (activeScrollContainer && activeBridge) {
    renderView(activeScrollContainer, activeBridge);
  }
}

export function closeModsView(targetElement?: HTMLElement | null): void {
  stopSpotlightTimer();
  selectedModId = null;
  activeScrollContainer = null;
  activeBridge = null;
  for (const old of Array.from(document.querySelectorAll("#agy-boost-mods-view"))) {
    old.remove();
  }
  activeModsView = null;
  updateSidebarActiveState(false, targetElement);

  // Disconnect header observer and restore hidden header elements
  if (headerObserver) {
    headerObserver.disconnect();
    headerObserver = null;
  }

  for (const [el, prev] of hiddenHeaderElements.entries()) {
    if (el.isConnected) {
      el.style.display = prev === "" || prev === "none" || prev === "block" ? "" : prev;
    }
  }
  hiddenHeaderElements.clear();

  // Defensive restoration for any titlebar or aux elements
  const auxToggle = document.querySelector<HTMLElement>('[data-testid="toggle-aux-sidebar"]');
  if (auxToggle) {
    const auxContainer = auxToggle.closest<HTMLElement>(".absolute.right-0.z-50") || auxToggle;
    auxContainer.style.display = "";
  }
  const header = document.querySelector('[data-main-content-header="true"]');
  if (header) {
    const leftCluster = header.querySelector<HTMLElement>(
      ".agy-layout-vars.flex.items-center.gap-1.min-w-0.pl-2"
    );
    if (leftCluster) {
      for (const child of Array.from(leftCluster.children)) {
        if (child instanceof HTMLElement) child.style.display = "";
      }
    }
    const rightToolbar = header.querySelector<HTMLElement>('[data-testid="pane-titlebar-toolbar"]');
    if (rightToolbar) {
      for (const child of Array.from(rightToolbar.children)) {
        if (child instanceof HTMLElement) child.style.display = "";
      }
    }
  }

  // Safely restore hidden siblings without corrupting flexbox classes
  for (const [child, prev] of hiddenSiblings.entries()) {
    if (child.isConnected) {
      child.style.display = prev === "" || prev === "none" || prev === "block" ? "" : prev;
    }
    delete child.dataset.agyBoostHidden;
  }
  hiddenSiblings.clear();

  // Guardrail invariant: ensure conversation-view is never left collapsed
  const conv = document.querySelector('[data-testid="conversation-view"]') as HTMLElement | null;
  if (conv && (conv.style.display === "block" || conv.style.display === "none")) {
    conv.style.display = "";
  }
}

function renderView(scrollContainer: HTMLElement, bridge: DaemonBridge): void {
  activeScrollContainer = scrollContainer;
  activeBridge = bridge;
  scrollContainer.innerHTML = "";

  // If a mod detail screen is requested, render 1:1 detail page
  if (selectedModId) {
    renderModDetail(scrollContainer, {
      modId: selectedModId,
      sourceTab: selectedModSource,
      bridge,
      onBack: () => {
        selectedModId = null;
        currentTab = selectedModSource;
        renderView(scrollContainer, bridge);
      },
      onRefresh: () => {
        renderView(scrollContainer, bridge);
      },
    });
    return;
  }

  // 1. Sticky Header
  const stickyHeader = el("div", { class: "sticky top-0 z-20 bg-background" });
  const headerInner = el("div", {
    class: "w-full max-w-4xl mx-auto px-4 sm:px-8 pt-8 pb-4 flex flex-col gap-4",
  });

  // Top row: Title and Tabs
  const titleRow = el("div", {
    class: "flex flex-wrap items-center justify-between gap-2 sm:gap-4",
  });
  const title = el("h1", { class: "text-xl font-medium text-foreground select-none sm:px-3 m-0" }, [
    "Mods",
  ]);

  // Segmented Pill Tabs (Marketplace / Installed)
  const navTabs = el("nav", {
    "aria-label": "Mods views",
    class:
      "agy-pill inline-flex items-center h-8 rounded-lg border border-border bg-secondary/20 p-0.5 gap-0.5 select-none",
    "data-testid": "plugins-tabs",
  });
  navTabs.setAttribute("data-legacy-testid", "mods-tabs");

  const tabClassActive =
    "agy-pill inline-flex items-center justify-center h-full px-2 rounded-md shrink-0 whitespace-nowrap no-underline transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-primary bg-secondary text-foreground active";
  const tabClassInactive =
    "agy-pill inline-flex items-center justify-center h-full px-2 rounded-md shrink-0 whitespace-nowrap no-underline transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-primary text-secondary-foreground hover:text-foreground";

  const btnMarketplace = el(
    "button",
    {
      type: "button",
      "data-testid": "plugins-tab-browse",
      class: currentTab === "marketplace" ? tabClassActive : tabClassInactive,
      onclick: () => {
        currentTab = "marketplace";
        renderView(scrollContainer, bridge);
      },
    },
    ["Marketplace"]
  );

  const btnInstalled = el(
    "button",
    {
      type: "button",
      "data-testid": "plugins-tab-installed",
      class: currentTab === "installed" ? tabClassActive : tabClassInactive,
      onclick: () => {
        stopSpotlightTimer();
        currentTab = "installed";
        renderView(scrollContainer, bridge);
      },
    },
    ["Installed"]
  );

  navTabs.appendChild(btnMarketplace);
  navTabs.appendChild(btnInstalled);

  titleRow.appendChild(title);
  titleRow.appendChild(el("div", { class: "flex items-center gap-4" }, [navTabs]));

  // Bottom row: Search field
  const searchRow = el("div", { class: "flex items-center" });
  const searchField = el("div", {
    class:
      "agy-field focus-within-ring relative flex items-center h-8 grow rounded-lg bg-muted border border-border transition-colors",
  });

  // Native Search Icon SVG (exact Willow parity: 16x16, left-2, pointer-events-none)
  const searchSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  searchSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  searchSvg.setAttribute("width", "16");
  searchSvg.setAttribute("height", "16");
  searchSvg.setAttribute("viewBox", "0 -960 960 960");
  searchSvg.setAttribute("fill", "currentColor");
  searchSvg.setAttribute("class", "absolute left-2 text-muted-foreground pointer-events-none");
  searchSvg.style.cssText = "position: absolute; left: 8px; width: 16px; height: 16px;";

  const searchPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  searchPath.setAttribute(
    "d",
    "M781.69-136.92L530.46-388.16q-30,24.77-69,38.77t-80.69,14q-102.46,0-173.54-71.08T136.16-580t71.08-173.54t173.54-71.08t173.54,71.08T625.38-580q0,42.85-14.38,81.85t-38.38,67.85L823.84-179.08l-42.15,42.15ZM380.77-395.38q77.31,0 130.96-53.65T565.39-580T511.73-710.96T380.77-764.62T249.81-710.96T196.15-580t53.65,130.96t130.96,53.65Z"
  );
  searchSvg.appendChild(searchPath);

  const searchInput = el("input", {
    type: "text",
    placeholder: "Search mods...",
    "data-testid": "customizations-search",
    class:
      "w-full h-full !pl-7 pr-3 placeholder:text-placeholder bg-transparent outline-none no-focus-ring text-foreground select-text",
    style:
      "padding-left: 28px !important; padding-right: 12px; font-size: 14px; line-height: 20px; font-family: inherit;",
    value: searchQuery,
    oninput: (e: Event) => {
      searchQuery = (e.target as HTMLInputElement).value;
      renderContent(contentWrapper, bridge, scrollContainer);
    },
  });
  searchInput.setAttribute("data-legacy-testid", "mods-search");

  searchField.appendChild(searchSvg);
  searchField.appendChild(searchInput);
  searchRow.appendChild(searchField);

  headerInner.appendChild(titleRow);
  headerInner.appendChild(searchRow);
  stickyHeader.appendChild(headerInner);
  scrollContainer.appendChild(stickyHeader);

  // 2. Main Body Content
  const contentWrapper = el("div", { class: "max-w-4xl w-full mx-auto px-4 sm:px-8 py-6" });
  scrollContainer.appendChild(contentWrapper);

  renderContent(contentWrapper, bridge, scrollContainer);
}

async function renderContent(
  container: HTMLElement,
  bridge: DaemonBridge,
  scrollContainer: HTMLElement
): Promise<void> {
  container.innerHTML = "";

  if (currentTab === "marketplace") {
    renderMarketplaceTab(container, bridge, scrollContainer);
  } else {
    await renderInstalledTab(container, bridge, scrollContainer);
  }
}

function renderMarketplaceTab(
  container: HTMLElement,
  bridge: DaemonBridge,
  scrollContainer: HTMLElement
): void {
  const query = searchQuery.trim().toLowerCase();

  const marketplaceWrapper = el("div", {
    class: "flex flex-col gap-6",
    "data-testid": "customizations-marketplace",
  });
  const flexCol = el("div", { class: "flex flex-col gap-10" });
  marketplaceWrapper.appendChild(flexCol);

  // Featured Spotlight Hero Banner (only if no search active)
  if (!query) {
    flexCol.appendChild(
      renderSpotlightHost(
        bridge,
        () => {
          stopSpotlightTimer();
          currentTab = "installed";
          renderView(scrollContainer, bridge);
        },
        (modId: string) => {
          openModDetail(modId, "marketplace");
        }
      )
    );
  }

  // Categories (1:1 Willow Customizations Shelves)
  const categories: Array<{
    key: "compute" | "theme" | "sidecar";
    title: string;
    subtitle: string;
  }> = [
    {
      key: "compute",
      title: "Developer Tools",
      subtitle: "High-performance compute, token reasoning budgets, and AST optimization tools.",
    },
    {
      key: "theme",
      title: "Design, Creative & Media",
      subtitle: "Willow visual themes, high-DPI compact spacing, and status bar telemetry.",
    },
    {
      key: "sidecar",
      title: "Productivity & Project Management",
      subtitle: "Multi-branch worktree management, local LLM bridging, and project automation.",
    },
  ];

  let matchesFound = 0;

  for (const cat of categories) {
    const modsInCat = MARKETPLACE_CATALOG.filter((m) => {
      if (m.category !== cat.key) return false;
      if (!query) return true;
      return (
        m.name.toLowerCase().includes(query) ||
        m.description.toLowerCase().includes(query) ||
        m.badges.some((b) => b.toLowerCase().includes(query))
      );
    });

    if (modsInCat.length === 0) continue;
    matchesFound += modsInCat.length;

    const section = el("section", {
      "aria-label": cat.title,
      class: "flex flex-col gap-3",
    });

    // Section Header (exact parity: h2, gap-1, px-3)
    const sectionHeader = el("div", { class: "flex flex-col gap-1 px-3" }, [
      el("h2", { class: "text-lg font-medium text-foreground" }, [cat.title]),
      el("p", { class: "text-sm text-muted-foreground" }, [cat.subtitle]),
    ]);
    section.appendChild(sectionHeader);

    // 2-column grid of cards
    const grid = el("div", { class: "grid gap-2 grid-cols-1 sm:grid-cols-2" });

    for (const mod of modsInCat) {
      const card = el("div", {
        class:
          "agy-card relative isolate flex items-center gap-3 p-3 rounded-xl hover:bg-muted/70 transition-colors h-[72px] cursor-pointer",
        "data-testid": "customization-card",
        "data-card-name": mod.name,
        onclick: (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest("button")) return;
          openModDetail(mod.id, "marketplace");
        },
      });

      // 48x48 icon
      const iconBox = el("div", {
        class: `flex items-center justify-center flex-shrink-0 overflow-hidden w-12 h-12 rounded-xl pointer-events-none ${mod.iconBg}`,
      });
      iconBox.innerHTML = mod.iconSvg;

      // Meta info (1:1 Willow typography with <a> link)
      const titleLink = el(
        "a",
        {
          href: `#/mods/${mod.id}`,
          class:
            "rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary text-left cursor-pointer",
          onclick: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            openModDetail(mod.id, "marketplace");
          },
        },
        [mod.name]
      );

      const titleContainer = el("div", { class: "font-medium text-foreground truncate" }, [
        titleLink,
      ]);

      const meta = el("div", { class: "flex-1 min-w-0 flex flex-col gap-0.5 pr-4 select-none" }, [
        el("div", { class: "flex items-center gap-1.5 min-w-0" }, [titleContainer]),
        el("div", { class: "text-sm text-muted-foreground truncate select-none" }, [
          mod.description,
        ]),
      ]);

      // Action button (exact parity: h-6 w-6, 22x22 svg, rounded-md)
      const actionBox = el("div", { class: "relative z-10 flex-shrink-0 flex items-center" });
      const addBtn = el("button", {
        type: "button",
        class:
          "agy-button agy-button-icon inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:text-foreground focus-visible:bg-secondary h-6 w-6 shrink-0 flex items-center justify-center rounded-md disabled:opacity-100",
        title: `Install ${mod.name}`,
        "aria-label": `Install ${mod.name}`,
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          stopSpotlightTimer();
          currentTab = "installed";
          renderView(scrollContainer, bridge);
        },
      });
      addBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 -960 960 960" fill="currentColor"><path d="M450-450H250q-12.75,0-21.37-8.63T220-480.01t8.62-21.37T250-510H450V-710q0-12.75 8.63-21.37T480.01-740t21.37,8.62T510-710v200H710q12.75,0 21.37,8.63T740-479.99t-8.62,21.37T710-450H510v200q0,12.75-8.63,21.37T479.99-220t-21.37-8.62T450-250V-450Z"/></svg>`;

      actionBox.appendChild(addBtn);

      card.appendChild(iconBox);
      card.appendChild(meta);
      card.appendChild(actionBox);
      grid.appendChild(card);
    }

    section.appendChild(grid);

    // Exact Willow "See more" footer button
    const seeMoreBtn = el("div", { class: "flex justify-start" }, [
      el(
        "button",
        {
          type: "button",
          class:
            "agy-button agy-button-custom inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 px-3 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:underline inline-flex items-center gap-1 cursor-pointer",
          "aria-label": `See more in ${cat.title}`,
          onclick: () => {
            stopSpotlightTimer();
            currentTab = "installed";
            renderView(scrollContainer, bridge);
          },
        },
        [
          createSvgIcon(
            `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 -960 960 960" fill="currentColor"><path d="M450-450H250q-12.75,0-21.37-8.63T220-480.01t8.62-21.37T250-510H450V-710q0-12.75 8.63-21.37T480.01-740t21.37,8.62T510-710v200H710q12.75,0 21.37,8.63T740-479.99t-8.62,21.37T710-450H510v200q0,12.75-8.63,21.37T479.99-220t-21.37-8.62T450-250V-450Z"/></svg>`
          ),
          "See more",
        ]
      ),
    ]);
    section.appendChild(seeMoreBtn);

    flexCol.appendChild(section);
  }

  if (matchesFound === 0 && query) {
    const emptyState = el(
      "div",
      {
        class:
          "p-12 text-center rounded-2xl border border-dashed border-border text-muted-foreground flex flex-col items-center gap-2",
      },
      [
        el("p", { class: "text-sm font-medium" }, [`No mods found matching "${query}"`]),
        el("p", { class: "text-xs text-muted-foreground" }, [
          "Try searching by category, language, or keyword.",
        ]),
      ]
    );
    flexCol.appendChild(emptyState);
  }

  // Exact Willow Marketplace Footer Notice
  if (!query) {
    const footer = el(
      "footer",
      {
        "aria-label": "Marketplace notice",
        "data-testid": "marketplace-footer",
        class: "mt-4 border-t border-border/60 pt-5 px-3",
      },
      [
        el(
          "p",
          {
            "data-testid": "third-party-tools-disclaimer",
            class: "m-0 text-sm text-muted-foreground leading-relaxed",
          },
          [
            "AGY Boost native mods run locally on your machine with direct in-client DOM access, WebAssembly acceleration, and loopback daemon IPC.",
          ]
        ),
      ]
    );
    marketplaceWrapper.appendChild(footer);
  }

  container.appendChild(marketplaceWrapper);
}

async function renderInstalledTab(
  container: HTMLElement,
  bridge: DaemonBridge,
  scrollContainer: HTMLElement
): Promise<void> {
  const isHealthy = await bridge.isHealthy();
  const allMods = await bridge.getMods();
  const query = searchQuery.trim().toLowerCase();

  const filteredMods = allMods.filter((m) => {
    if (!query) return true;
    return (
      m.name.toLowerCase().includes(query) ||
      m.description?.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    );
  });

  const flexCol = el("div", {
    class: "flex flex-col gap-8",
    "data-testid": "customizations-installed",
  });
  container.appendChild(flexCol);

  // 1. Installed Mods Section
  const installedSection = el("section", {
    class: "flex flex-col gap-3",
    "data-testid": "customizations-installed-mods",
  });

  const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="w-4 h-4 shrink-0 text-muted-foreground transition-transform ${installedModsCollapsed ? "" : "rotate-90"}"><path d="M517.85-480l-184-184L376-706.15L602.15-480L376-253.85L333.85-296l184-184Z"></path></svg>`;

  const toggleCollapseBtn = el(
    "button",
    {
      type: "button",
      "aria-expanded": installedModsCollapsed ? "false" : "true",
      class: "flex cursor-pointer items-center gap-2 select-none text-left",
      onclick: () => {
        installedModsCollapsed = !installedModsCollapsed;
        renderContent(container, bridge, scrollContainer);
      },
    },
    [
      "Installed Mods",
      el(
        "span",
        {
          "data-testid": "customization-section-count",
          class:
            "inline-flex items-center text-[11px] leading-4 px-2 py-0.5 rounded-full shrink-0 font-normal bg-muted text-muted-foreground",
        },
        [String(allMods.length)]
      ),
      createSvgIcon(chevronSvg),
    ]
  );

  const folderLabel = el("span", {}, ["Open Folder"]);
  const folderBtn = el(
    "button",
    {
      type: "button",
      "data-testid": "mods-open-folder",
      class:
        "agy-button agy-button-xs inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:text-foreground focus-visible:bg-secondary h-6 text-sm rounded-md gap-1 px-2.5 rounded-full",
      title: "Open Mods Directory",
      onclick: async (e: MouseEvent) => {
        e.stopPropagation();
        try {
          const res = await bridge.openModsFolder();
          if (res.path && typeof navigator !== "undefined" && navigator.clipboard) {
            try {
              await navigator.clipboard.writeText(res.path);
            } catch {}
          }
          const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent || "");
          const successMsg = isMac ? "Opened in Finder!" : "Opened in Explorer!";
          folderLabel.textContent = res.ok ? successMsg : "Copied Path!";
          setTimeout(() => {
            folderLabel.textContent = "Open Folder";
          }, 2000);
        } catch {
          folderLabel.textContent = "Copied Path!";
          setTimeout(() => {
            folderLabel.textContent = "Open Folder";
          }, 2000);
        }
      },
    },
    [
      createSvgIcon(
        `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"/></svg>`
      ),
      folderLabel,
    ]
  );

  const sectionHeader = el("div", { class: "flex items-center justify-between gap-4 pl-3" }, [
    el("h3", { class: "min-w-0 font-medium text-lg text-foreground" }, [toggleCollapseBtn]),
    el("div", { class: "flex items-center gap-1" }, [folderBtn]),
  ]);

  installedSection.appendChild(sectionHeader);

  const installedContent = el("div", {
    class: "flex flex-col gap-2",
    style: installedModsCollapsed ? "display: none;" : "",
  });

  if (allMods.length === 0) {
    const empty = el(
      "div",
      {
        class:
          "p-8 text-center rounded-xl border border-dashed border-border text-muted-foreground flex flex-col items-center gap-2",
      },
      [
        el("p", { class: "text-sm font-medium" }, ["No mods currently installed"]),
        el("p", { class: "text-xs text-muted-foreground" }, [
          "Select mods from the Marketplace tab or place custom mods into your AGY Boost directory.",
        ]),
        el(
          "button",
          {
            type: "button",
            class:
              "mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-colors cursor-pointer",
            onclick: () => {
              currentTab = "marketplace";
              renderView(scrollContainer, bridge);
            },
          },
          ["Browse Marketplace"]
        ),
      ]
    );
    installedContent.appendChild(empty);
  } else {
    const grid = el("div", { class: "grid gap-2 grid-cols-1 sm:grid-cols-2" });

    for (const mod of filteredMods) {
      const card = el("div", {
        class:
          "agy-card relative isolate flex items-center gap-3 p-3 rounded-xl hover:bg-muted/70 transition-colors h-[72px] cursor-pointer",
        "data-testid": "customization-card",
        "data-card-name": mod.name,
        onclick: (e: MouseEvent) => {
          if (
            (e.target as HTMLElement).closest("button") ||
            (e.target as HTMLElement).closest('[role="switch"]')
          )
            return;
          openModDetail(mod.id, "installed");
        },
      });

      // 48x48 icon
      const iconBox = el("div", {
        class:
          "flex items-center justify-center flex-shrink-0 overflow-hidden w-12 h-12 rounded-xl bg-muted/40 text-primary pointer-events-none",
      });
      iconBox.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c0-1.57.802-2.54 1.561-2.85-1.561-.92-3.565-.63-4.5.5-1.07 1.28-1.5 2.5-3.5 2.5s-2.43-1.22-3.5-2.5c-.935-1.13-2.939-1.42-4.5-.5.759.31 1.561 1.28 1.561 2.85 0 1.93-1.61 3.5-3.561 3.5v3.3c1.951 0 3.561 1.57 3.561 3.5 0 1.57-.802 2.54-1.561 2.85 1.561.92 3.565.63 4.5-.5 1.07-1.28 1.5-2.5 3.5-2.5s2.43 1.22 3.5 2.5c.935 1.13 2.939 1.42 4.5.5-.759-.31-1.561-1.28-1.561-2.85 0-1.93 1.61-3.5 3.561-3.5v-3.3c-1.951 0-3.561-1.57-3.561-3.5Z"/></svg>`;

      // Meta info (1:1 Willow text-sm typography with <a> link)
      const titleLink = el(
        "a",
        {
          href: `#/mods/${mod.id}`,
          class:
            "rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary text-left cursor-pointer",
          onclick: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            openModDetail(mod.id, "installed");
          },
        },
        [mod.name]
      );

      const titleContainer = el("div", { class: "font-medium text-foreground truncate" }, [
        titleLink,
      ]);

      const meta = el("div", { class: "flex-1 min-w-0 flex flex-col gap-0.5 pr-4" }, [
        el("div", { class: "flex items-center gap-1.5 min-w-0" }, [titleContainer]),
        el("div", { class: "text-sm text-muted-foreground truncate" }, [
          mod.description || "No description provided.",
        ]),
      ]);

      // Willow Toggle Switch + More Actions Button
      const actionBox = el("div", {
        class: "relative z-10 flex-shrink-0 flex items-center gap-1.5",
      });
      const toggleBtn = el(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": mod.enabled ? "true" : "false",
          title: mod.enabled ? `Disable ${mod.name}` : `Enable ${mod.name}`,
          class: `relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            mod.enabled ? "bg-primary" : "bg-muted"
          }`,
          onclick: async (e: MouseEvent) => {
            e.stopPropagation();
            await bridge.toggleMod(mod.id, !mod.enabled);
            await syncModStyles(bridge);
            await syncModScripts(bridge);
            await renderContent(container, bridge, scrollContainer);
          },
        },
        [
          el("span", {
            class: `pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ease-in-out ${
              mod.enabled ? "translate-x-4" : "translate-x-0"
            }`,
          }),
        ]
      );

      const moreActionsBtn = el(
        "button",
        {
          type: "button",
          class:
            "agy-button agy-button-icon inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:text-foreground focus-visible:bg-secondary h-6 w-6 shrink-0 flex items-center justify-center rounded-md",
          "aria-label": `More actions for ${mod.name}`,
          onclick: (e: MouseEvent) => {
            e.stopPropagation();
          },
        },
        [
          createSvgIcon(
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-189.23q-24.75,0-42.37-17.62T420-249.23t17.62-42.37T480-309.23t42.37,17.62T540-249.23t-17.62,42.37T480-189.23ZM480-420q-24.75,0-42.37-17.62T420-480t17.62-42.37T480-540t42.37,17.62T540-480t-17.62,42.37T480-420Zm0-230.77q-24.75,0-42.37-17.62T420-710.77t17.62-42.37T480-770.77t42.37,17.62T540-710.77t-17.62,42.37T480-650.77Z"/></svg>`
          ),
        ]
      );

      actionBox.appendChild(toggleBtn);
      actionBox.appendChild(moreActionsBtn);

      card.appendChild(iconBox);
      card.appendChild(meta);
      card.appendChild(actionBox);
      grid.appendChild(card);
    }

    installedContent.appendChild(grid);
  }

  installedSection.appendChild(installedContent);
  flexCol.appendChild(installedSection);

  // 2. Skills & Rules Section (Exact 1:1 Parity with Customizations)
  const skillsList = [
    {
      name: "/effort-optimizer",
      desc: "Fine-tune AI reasoning depth and token budgets in real-time.",
    },
    {
      name: "/stream-accel",
      desc: "High-throughput SSE buffer engine that eliminates stream stutter.",
    },
    {
      name: "/theme-oled",
      desc: "True pitch-black palette engineered specifically for OLED displays.",
    },
    {
      name: "/ui-telemetry",
      desc: "Live telemetry HUD monitoring speed, latency, tokens, and daemon memory.",
    },
    {
      name: "/local-llm-bridge",
      desc: "Zero-config bridge connecting local Ollama, llama.cpp, LM Studio, and vLLM models.",
    },
    {
      name: "/git-worktree",
      desc: "Isolated background engine managing simultaneous Git worktrees without re-indexing.",
    },
  ];

  const skillsSection = el("section", {
    class: "flex flex-col gap-3",
    "data-testid": "customizations-installed-skills",
  });
  const skillsChevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="w-4 h-4 shrink-0 text-muted-foreground transition-transform ${skillsRulesCollapsed ? "" : "rotate-90"}"><path d="M517.85-480l-184-184L376-706.15L602.15-480L376-253.85L333.85-296l184-184Z"></path></svg>`;

  const toggleSkillsBtn = el(
    "button",
    {
      type: "button",
      "aria-expanded": skillsRulesCollapsed ? "false" : "true",
      class: "flex cursor-pointer items-center gap-2 select-none text-left",
      onclick: () => {
        skillsRulesCollapsed = !skillsRulesCollapsed;
        renderContent(container, bridge, scrollContainer);
      },
    },
    [
      "Skills & Rules",
      el(
        "span",
        {
          "data-testid": "customization-section-count",
          class:
            "inline-flex items-center text-[11px] leading-4 px-2 py-0.5 rounded-full shrink-0 font-normal bg-muted text-muted-foreground",
        },
        [String(skillsList.length)]
      ),
      createSvgIcon(skillsChevronSvg),
    ]
  );

  const skillsHeader = el("div", { class: "flex items-center justify-between gap-4 pl-3" }, [
    el("h3", { class: "min-w-0 font-medium text-lg text-foreground" }, [toggleSkillsBtn]),
  ]);
  skillsSection.appendChild(skillsHeader);

  const skillsContent = el("div", {
    class: "flex flex-col gap-1",
    style: skillsRulesCollapsed ? "display: none;" : "",
  });
  const skillsInnerCol = el("div", { class: "flex flex-col" });

  for (const s of skillsList) {
    const modId = s.name.replace(/^\//, "");
    const item = el(
      "div",
      {
        class:
          "group relative flex items-center rounded-lg hover:bg-secondary focus-within:bg-secondary",
      },
      [
        el(
          "button",
          {
            type: "button",
            class:
              "w-full min-w-0 px-3 py-1.5 text-left rounded-lg cursor-pointer outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
            onclick: () => {
              openModDetail(modId, "installed");
            },
          },
          [
            el("div", { class: "flex items-baseline gap-2.5 min-w-0 pr-14" }, [
              el("span", { class: "font-medium flex-shrink-0 text-foreground" }, [s.name]),
              el("span", { class: "text-muted-foreground truncate", title: s.desc }, [s.desc]),
            ]),
          ]
        ),
        el(
          "div",
          {
            class:
              "absolute top-0 bottom-0 right-0 pr-2 pl-8 flex items-center justify-end gap-1 z-10 rounded-r-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
            style: "background: linear-gradient(to right, transparent 0%, var(--secondary) 25%);",
          },
          [
            el(
              "button",
              {
                type: "button",
                class:
                  "agy-button agy-button-icon inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:text-foreground focus-visible:bg-secondary h-6 w-6 shrink-0 flex items-center justify-center rounded-md",
                "aria-label": `More actions for ${s.name}`,
              },
              [
                createSvgIcon(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-189.23q-24.75,0-42.37-17.62T420-249.23t17.62-42.37T480-309.23t42.37,17.62T540-249.23t-17.62,42.37T480-189.23ZM480-420q-24.75,0-42.37-17.62T420-480t17.62-42.37T480-540t42.37,17.62T540-480t-17.62,42.37T480-420Zm0-230.77q-24.75,0-42.37-17.62T420-710.77t17.62-42.37T480-770.77t42.37,17.62T540-710.77t-17.62,42.37T480-650.77Z"/></svg>`
                ),
              ]
            ),
          ]
        ),
      ]
    );
    skillsInnerCol.appendChild(item);
  }
  skillsContent.appendChild(skillsInnerCol);
  skillsSection.appendChild(skillsContent);
  flexCol.appendChild(skillsSection);

  // 3. Custom Agents Section (Exact 1:1 Parity)
  const agentsSection = el("section", {
    class: "flex flex-col gap-3",
    "data-testid": "customizations-installed-agents",
  });
  const agentsChevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="w-4 h-4 shrink-0 text-muted-foreground transition-transform ${customAgentsCollapsed ? "" : "rotate-90"}"><path d="M517.85-480l-184-184L376-706.15L602.15-480L376-253.85L333.85-296l184-184Z"></path></svg>`;

  const toggleAgentsBtn = el(
    "button",
    {
      type: "button",
      "aria-expanded": customAgentsCollapsed ? "false" : "true",
      class: "flex cursor-pointer items-center gap-2 select-none text-left",
      onclick: () => {
        customAgentsCollapsed = !customAgentsCollapsed;
        renderContent(container, bridge, scrollContainer);
      },
    },
    [
      "Custom Agents",
      el(
        "span",
        {
          "data-testid": "customization-section-count",
          class:
            "inline-flex items-center text-[11px] leading-4 px-2 py-0.5 rounded-full shrink-0 font-normal bg-muted text-muted-foreground",
        },
        ["0"]
      ),
      createSvgIcon(agentsChevronSvg),
    ]
  );

  const agentsHeader = el("div", { class: "flex items-center justify-between gap-4 pl-3" }, [
    el("h3", { class: "min-w-0 font-medium text-lg text-foreground" }, [toggleAgentsBtn]),
  ]);
  agentsSection.appendChild(agentsHeader);

  const agentsContent = el(
    "p",
    {
      class: "pl-3 text-sm text-muted-foreground",
      style: customAgentsCollapsed ? "display: none;" : "",
    },
    ["No custom agents yet."]
  );
  agentsSection.appendChild(agentsContent);
  flexCol.appendChild(agentsSection);

  // 4. MCP Servers Section (Exact 1:1 Parity)
  const mcpSection = el("section", {
    class: "flex flex-col gap-3",
    "data-testid": "customizations-installed-mcp",
  });
  const mcpChevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="w-4 h-4 shrink-0 text-muted-foreground transition-transform ${mcpServersCollapsed ? "" : "rotate-90"}"><path d="M517.85-480l-184-184L376-706.15L602.15-480L376-253.85L333.85-296l184-184Z"></path></svg>`;

  const toggleMcpBtn = el(
    "button",
    {
      type: "button",
      "aria-expanded": mcpServersCollapsed ? "false" : "true",
      class: "flex cursor-pointer items-center gap-2 select-none text-left",
      onclick: () => {
        mcpServersCollapsed = !mcpServersCollapsed;
        renderContent(container, bridge, scrollContainer);
      },
    },
    [
      "MCP Servers",
      el(
        "span",
        {
          "data-testid": "customization-section-count",
          class:
            "inline-flex items-center text-[11px] leading-4 px-2 py-0.5 rounded-full shrink-0 font-normal bg-muted text-muted-foreground",
        },
        ["1"]
      ),
      createSvgIcon(mcpChevronSvg),
    ]
  );

  const mcpHeader = el("div", { class: "flex items-center justify-between gap-4 pl-3" }, [
    el("h3", { class: "min-w-0 font-medium text-lg text-foreground" }, [toggleMcpBtn]),
  ]);
  mcpSection.appendChild(mcpHeader);

  const mcpContent = el("div", {
    class: "flex flex-col gap-1",
    style: mcpServersCollapsed ? "display: none;" : "",
  });
  const mcpItem = el(
    "div",
    {
      class:
        "group relative flex items-center rounded-lg hover:bg-secondary focus-within:bg-secondary",
    },
    [
      el(
        "button",
        {
          type: "button",
          class:
            "w-full min-w-0 px-3 py-1.5 text-left rounded-lg cursor-pointer outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        },
        [
          el("div", { class: "flex items-baseline gap-2.5 min-w-0 pr-14" }, [
            el("span", { class: "font-medium flex-shrink-0 text-foreground" }, [
              "AGY Boost Daemon (Loopback IPC)",
            ]),
            el(
              "span",
              {
                class: "text-muted-foreground truncate",
                title: "http://127.0.0.1:42042 • Native Go Daemon Loopback Bridge",
              },
              ["http://127.0.0.1:42042 • Native Go Daemon Loopback Bridge"]
            ),
          ]),
        ]
      ),
      el(
        "div",
        {
          class:
            "absolute top-0 bottom-0 right-0 pr-2 pl-8 flex items-center justify-end gap-1 z-10 rounded-r-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
          style: "background: linear-gradient(to right, transparent 0%, var(--secondary) 25%);",
        },
        [
          el(
            "button",
            {
              type: "button",
              class:
                "agy-button agy-button-icon inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:text-foreground focus-visible:bg-secondary h-6 w-6 shrink-0 flex items-center justify-center rounded-md",
              "aria-label": "More actions for daemon",
            },
            [
              createSvgIcon(
                `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-189.23q-24.75,0-42.37-17.62T420-249.23t17.62-42.37T480-309.23t42.37,17.62T540-249.23t-17.62,42.37T480-189.23ZM480-420q-24.75,0-42.37-17.62T420-480t17.62-42.37T480-540t42.37,17.62T540-480t-17.62,42.37T480-420Zm0-230.77q-24.75,0-42.37-17.62T420-710.77t17.62-42.37T480-770.77t42.37,17.62T540-710.77t-17.62,42.37T480-650.77Z"/></svg>`
              ),
            ]
          ),
        ]
      ),
    ]
  );
  mcpContent.appendChild(mcpItem);
  mcpSection.appendChild(mcpContent);
  flexCol.appendChild(mcpSection);

  // 5. Platform Engines Section (Parity with native platform status)
  const enginesSection = el("section", {
    class: "flex flex-col gap-3",
    "data-testid": "customizations-platform-engines",
  });
  const engineChevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="w-4 h-4 shrink-0 text-muted-foreground transition-transform ${platformEnginesCollapsed ? "" : "rotate-90"}"><path d="M517.85-480l-184-184L376-706.15L602.15-480L376-253.85L333.85-296l184-184Z"></path></svg>`;

  const toggleEnginesBtn = el(
    "button",
    {
      type: "button",
      "aria-expanded": platformEnginesCollapsed ? "false" : "true",
      class: "flex cursor-pointer items-center gap-2 select-none text-left",
      onclick: () => {
        platformEnginesCollapsed = !platformEnginesCollapsed;
        renderContent(container, bridge, scrollContainer);
      },
    },
    [
      "Platform Engines",
      el(
        "span",
        {
          "data-testid": "customization-section-count",
          class:
            "inline-flex items-center text-[11px] leading-4 px-2 py-0.5 rounded-full shrink-0 font-normal bg-muted text-muted-foreground",
        },
        ["3"]
      ),
      createSvgIcon(engineChevronSvg),
    ]
  );

  const enginesHeader = el("div", { class: "flex items-center justify-between gap-4 pl-3" }, [
    el("h3", { class: "min-w-0 font-medium text-lg text-foreground" }, [toggleEnginesBtn]),
  ]);
  enginesSection.appendChild(enginesHeader);

  const enginesContent = el("div", {
    class: "flex flex-col gap-2",
    style: platformEnginesCollapsed ? "display: none;" : "",
  });
  const enginesGrid = el("div", { class: "grid gap-2 grid-cols-1 sm:grid-cols-2" });

  // Engine 1: Go Daemon
  const daemonCard = el(
    "div",
    {
      class:
        "agy-card relative isolate flex items-center gap-3 p-3 rounded-xl hover:bg-muted/70 transition-colors h-[72px]",
    },
    [
      el(
        "div",
        {
          class:
            "flex items-center justify-center flex-shrink-0 overflow-hidden w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400",
        },
        [
          createSvgIcon(
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`
          ),
        ]
      ),
      el("div", { class: "flex-1 min-w-0 flex flex-col gap-0.5 pr-4" }, [
        el("div", { class: "flex items-center gap-1.5 min-w-0" }, [
          el("div", { class: "font-medium text-foreground truncate text-sm" }, [
            "Go Background Daemon",
          ]),
        ]),
        el("div", { class: "text-sm text-muted-foreground truncate" }, [
          isHealthy
            ? "127.0.0.1:42042 • Loopback IPC (<10MB RAM)"
            : "Offline • Start via 'agy-boost daemon'",
        ]),
      ]),
      el("div", { class: "relative z-10 flex-shrink-0 flex items-center pr-2" }, [
        el("div", {
          class: `w-2.5 h-2.5 rounded-full ${isHealthy ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-amber-500"}`,
        }),
      ]),
    ]
  );

  // Engine 2: WebAssembly Compute Engine
  const wasmCard = el(
    "div",
    {
      class:
        "agy-card relative isolate flex items-center gap-3 p-3 rounded-xl hover:bg-muted/70 transition-colors h-[72px]",
    },
    [
      el(
        "div",
        {
          class:
            "flex items-center justify-center flex-shrink-0 overflow-hidden w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400",
        },
        [
          createSvgIcon(
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m10 15 5-3-5-3v6Z"/></svg>`
          ),
        ]
      ),
      el("div", { class: "flex-1 min-w-0 flex flex-col gap-0.5 pr-4" }, [
        el("div", { class: "flex items-center gap-1.5 min-w-0" }, [
          el("div", { class: "font-medium text-foreground truncate text-sm" }, [
            "WebAssembly Compute",
          ]),
        ]),
        el("div", { class: "text-sm text-muted-foreground truncate" }, [
          "Native Wasm loader & execution sandbox",
        ]),
      ]),
      el("div", { class: "relative z-10 flex-shrink-0 flex items-center pr-2" }, [
        el("div", {
          class: "w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50",
        }),
      ]),
    ]
  );

  // Engine 3: Pure TypeScript Runtime
  const tsCard = el(
    "div",
    {
      class:
        "agy-card relative isolate flex items-center gap-3 p-3 rounded-xl hover:bg-muted/70 transition-colors h-[72px]",
    },
    [
      el(
        "div",
        {
          class:
            "flex items-center justify-center flex-shrink-0 overflow-hidden w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400",
        },
        [
          createSvgIcon(
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
          ),
        ]
      ),
      el("div", { class: "flex-1 min-w-0 flex flex-col gap-0.5 pr-4" }, [
        el("div", { class: "flex items-center gap-1.5 min-w-0" }, [
          el("div", { class: "font-medium text-foreground truncate text-sm" }, [
            "Pure TS In-Client Runtime",
          ]),
        ]),
        el("div", { class: "text-sm text-muted-foreground truncate" }, [
          "Zero-dependency DOM manipulator & event bus",
        ]),
      ]),
      el("div", { class: "relative z-10 flex-shrink-0 flex items-center pr-2" }, [
        el("div", { class: "w-2.5 h-2.5 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50" }),
      ]),
    ]
  );

  enginesGrid.appendChild(daemonCard);
  enginesGrid.appendChild(wasmCard);
  enginesGrid.appendChild(tsCard);
  enginesContent.appendChild(enginesGrid);
  enginesSection.appendChild(enginesContent);
  flexCol.appendChild(enginesSection);
}

function getMainViewportContainer(): HTMLElement | null {
  // 1. Antigravity's active page content container inside the sheet (under the titlebar)
  const mainBody = document.querySelector<HTMLElement>('[data-main-content-body="true"]');
  if (mainBody) {
    const content = mainBody.querySelector<HTMLElement>(":scope > .flex-1.min-h-0");
    if (content) return content;
    return mainBody;
  }

  // 2. Fallback to conversation view parent if inside a direct chat
  const conv = document.querySelector<HTMLElement>('[data-testid="conversation-view"]');
  if (conv?.parentElement) {
    return conv.parentElement;
  }

  // 3. Fallback to aux-pane-split
  const auxPane = document.querySelector<HTMLElement>('[data-testid="aux-pane-split"]');
  if (auxPane) {
    const content = auxPane.querySelector<HTMLElement>(
      ".flex-1.min-h-0.flex.flex-col > .flex-1.min-h-0"
    );
    if (content) return content;
  }

  // 4. Fallback to .agy-sheet
  const sheet = document.querySelector<HTMLElement>(".agy-sheet");
  if (sheet) return sheet;

  return null;
}
