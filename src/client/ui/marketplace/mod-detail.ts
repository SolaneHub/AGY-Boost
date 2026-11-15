// AGY Boost Mod Detail View (1:1 Customizations Parity)

import { el, createSvgIcon } from "../dom.js";
import { DaemonBridge } from "../../bridge/daemon.js";
import { getMarketplaceMod } from "./catalog.js";

export interface ModDetailOptions {
  modId: string;
  sourceTab: "marketplace" | "installed";
  bridge: DaemonBridge;
  onBack: () => void;
  onRefresh: () => void;
}

function getCategoryLabel(cat?: string): string {
  switch (cat) {
    case "compute":
      return "Developer Tools";
    case "theme":
      return "Design, Creative & Media";
    case "sidecar":
      return "Productivity & Project Management";
    default:
      return "General Customization";
  }
}

function createMetaItem(label: string, value: string, testId?: string): HTMLElement {
  const item = el("div", { class: "shrink-0" }, [
    el("dt", { class: "mb-1.5 text-[11px] text-muted-foreground" }, [label]),
  ]);
  const dd = el("dd", { class: "font-medium text-foreground tabular-nums" }, [value]);
  if (testId) {
    dd.setAttribute("data-testid", testId);
  }
  item.appendChild(dd);
  return item;
}

function renderMarkdownBody(markdownText: string): HTMLElement {
  const root = el("div", {
    "data-markdown-root": "",
    class: "text-base leading-relaxed select-text flex flex-col md-divider-spacing break-words",
  });

  const lines = markdownText.split("\n");
  let currentList: HTMLElement | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      currentList = null;
      continue;
    }

    if (line.startsWith("### ")) {
      currentList = null;
      root.appendChild(
        el("h3", { class: "text-lg font-medium !mt-4 !mb-2 text-foreground" }, [
          line.replace(/^###\s+/, ""),
        ])
      );
    } else if (line.startsWith("## ")) {
      currentList = null;
      root.appendChild(
        el("h2", { class: "text-xl font-semibold !mt-6 !mb-2 text-foreground" }, [
          line.replace(/^##\s+/, ""),
        ])
      );
    } else if (line.startsWith("- ")) {
      if (!currentList) {
        currentList = el("ul", {
          class: "my-2 ps-4 list-disc flex flex-col gap-1 text-sm text-foreground/90",
        });
        root.appendChild(currentList);
      }
      const itemContent = line.replace(/^-\s+/, "");
      const strongMatch = itemContent.match(/^\*\*(.*?)\*\*:\s*(.*)$/);

      if (strongMatch) {
        const li = el("li", { class: "leading-relaxed" }, [
          el("strong", { class: "font-semibold text-foreground" }, [strongMatch[1]]),
          `: ${strongMatch[2]}`,
        ]);
        currentList.appendChild(li);
      } else {
        const li = el("li", { class: "leading-relaxed" }, [itemContent]);
        currentList.appendChild(li);
      }
    } else {
      currentList = null;
      root.appendChild(
        el("p", { class: "text-sm text-foreground/90 leading-relaxed my-1.5" }, [line])
      );
    }
  }

  return root;
}

export async function renderModDetail(
  container: HTMLElement,
  options: ModDetailOptions
): Promise<void> {
  const { modId, bridge, onBack, onRefresh } = options;

  let mod = getMarketplaceMod(modId);
  const installedMods = await bridge.getMods();
  const installedRecord = installedMods.find((m) => m.id === modId);
  const isInstalled = Boolean(installedRecord);
  const isEnabled = installedRecord ? installedRecord.enabled : false;

  // Synthesize metadata if installed custom mod not in static catalog
  if (!mod && installedRecord) {
    mod = {
      id: installedRecord.id,
      name: installedRecord.name,
      category: "compute",
      badges: ["LOCAL"],
      description: installedRecord.description || "Custom local AGY Boost mod.",
      iconBg: "bg-gradient-to-br from-indigo-500/20 to-purple-500/10 text-indigo-400",
      iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
      version: installedRecord.version || "1.0.0",
      author: installedRecord.author || "Local Developer",
      runtime: "AGY Boost In-Client Runtime",
      commands: [
        {
          name: `/${installedRecord.id}`,
          description: installedRecord.description || "Execute mod command.",
        },
      ],
      readme: `### Overview\n${installedRecord.name} runs as a local native mod with direct in-client DOM capabilities.`,
    };
  }

  if (!mod) {
    container.innerHTML = "";
    const errorView = el("div", { class: "p-8 text-center" }, [
      el("p", { class: "text-muted-foreground" }, [`Mod "${modId}" not found.`]),
      el(
        "button",
        {
          type: "button",
          class: "mt-4 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-sm cursor-pointer",
          onclick: onBack,
        },
        ["Back to Mods"]
      ),
    ]);
    container.appendChild(errorView);
    return;
  }

  container.innerHTML = "";

  // Exact 1:1 Shell matching Antigravity Customizations Plugin Detail
  const detailShell = el("div", {
    class: "flex-1 flex flex-col overflow-hidden h-full min-h-0 bg-background",
    "data-testid": "plugin-detail",
  });

  const scrollContainer = el("div", {
    class: "flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]",
  });

  const centerWrapper = el("div", {
    class: "w-full max-w-4xl mx-auto px-8 py-6",
  });

  const innerCol = el("div", {
    class: "w-full px-4 pb-4 pt-1",
  });

  // 1. Breadcrumb / Back button
  const backBtn = el(
    "button",
    {
      type: "button",
      class:
        "agy-button inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer py-1 px-2.5 rounded-lg hover:bg-secondary transition-colors mb-5 -ml-1 border-none bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-primary",
      "data-testid": "plugin-detail-back-button",
      "aria-label": "Back to Mods",
      onclick: onBack,
    },
    [
      createSvgIcon(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="pointer-events-none"><path d="M294.92-450L522.77-222.15L480-180L180-480L480-780l42.77,42.15L294.92-510H780v60H294.92Z"/></svg>`
      ),
      "Back to Mods",
    ]
  );
  innerCol.appendChild(backBtn);

  // 2. Header section (Icon + Title + Actions + Description)
  const headerCol = el("div", { class: "flex flex-col gap-3" });
  const titleRow = el("div", { class: "flex items-center justify-between gap-3 min-w-0" });
  const leftGroup = el("div", { class: "flex items-center gap-3 min-w-0" });

  const iconBox = el("div", {
    class: `flex items-center justify-center flex-shrink-0 overflow-hidden w-12 h-12 rounded-xl ${mod.iconBg}`,
  });
  iconBox.innerHTML = mod.iconSvg;

  const titleCol = el("div", { class: "flex flex-col gap-0.5 min-w-0" });
  const titleH1 = el(
    "h1",
    {
      class: "text-xl font-medium tracking-tight leading-tight text-foreground truncate min-w-0",
    },
    [mod.name]
  );
  titleCol.appendChild(titleH1);

  leftGroup.appendChild(iconBox);
  leftGroup.appendChild(titleCol);

  // Action Buttons
  const actionsBox = el("div", { class: "flex items-center gap-2 flex-shrink-0" });

  if (isInstalled) {
    // Willow Toggle Switch
    const toggleBtn = el(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": isEnabled ? "true" : "false",
        title: isEnabled ? `Disable ${mod.name}` : `Enable ${mod.name}`,
        class: `relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          isEnabled ? "bg-primary" : "bg-muted"
        }`,
        onclick: async () => {
          await bridge.toggleMod(modId, !isEnabled);
          onRefresh();
        },
      },
      [
        el("span", {
          class: `pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ease-in-out ${
            isEnabled ? "translate-x-4" : "translate-x-0"
          }`,
        }),
      ]
    );

    const openFolderBtn = el(
      "button",
      {
        type: "button",
        "data-testid": "plugin-detail-open-folder",
        class:
          "agy-button agy-button-icon inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:text-foreground focus-visible:bg-secondary h-7 w-7 shrink-0 flex items-center justify-center rounded-lg",
        title: "Open Folder",
        "aria-label": "Open Folder",
        onclick: async () => {
          await bridge.openModsFolder();
        },
      },
      [
        createSvgIcon(
          `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 -960 960 960" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"/></svg>`
        ),
      ]
    );

    actionsBox.appendChild(toggleBtn);
    actionsBox.appendChild(openFolderBtn);
  } else {
    const addBtn = el(
      "button",
      {
        type: "button",
        class:
          "agy-button agy-button-sm inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-primary text-primary-foreground hover:opacity-90 shadow-sm border-none h-7 text-base rounded-md gap-1.5 px-2.5",
        onclick: async () => {
          await bridge.toggleMod(modId, true);
          onRefresh();
        },
      },
      ["Add"]
    );
    actionsBox.appendChild(addBtn);
  }

  titleRow.appendChild(leftGroup);
  titleRow.appendChild(actionsBox);

  const descP = el("p", { class: "text-muted-foreground leading-relaxed mt-1" }, [mod.description]);
  headerCol.appendChild(titleRow);
  headerCol.appendChild(descP);
  innerCol.appendChild(headerCol);

  // 3. Main Content Container
  const mainContent = el("div", { class: "mt-8 flex flex-col gap-6" });

  // 4. Suggested Prompts List (Exact parity with Willow suggested prompts card)
  if (mod.prompts && mod.prompts.length > 0) {
    const promptList = el("div", {
      "data-testid": "plugin-suggested-prompt-list",
      class: "agy-card rounded-xl border border-border/60 p-1 flex flex-col",
    });

    for (const promptText of mod.prompts) {
      const textSpan = el("span", { class: "text-foreground min-w-0 flex-1 text-sm font-normal" }, [
        promptText,
      ]);

      const promptRow = el("button", {
        type: "button",
        "data-testid": "plugin-suggested-prompt-row",
        class:
          "group w-full min-w-0 px-3 py-2 text-left rounded-lg transition-colors outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary flex items-center justify-between gap-2.5 hover:bg-secondary cursor-pointer",
        onclick: () => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(promptText);
          }
          const prev = textSpan.textContent;
          textSpan.textContent = "Copied to clipboard!";
          setTimeout(() => {
            textSpan.textContent = prev;
          }, 1500);
        },
      });

      const leftContent = el("div", { class: "flex items-center gap-2.5 min-w-0 flex-1" });
      const miniIcon = el("div", {
        class: `flex items-center justify-center flex-shrink-0 overflow-hidden w-4 h-4 rounded-sm ${mod.iconBg}`,
      });
      miniIcon.innerHTML = mod.iconSvg.replace('width="24" height="24"', 'width="12" height="12"');

      leftContent.appendChild(miniIcon);
      leftContent.appendChild(textSpan);

      const arrowSvg = createSvgIcon(
        `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 -960 960 960" fill="currentColor" class="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"><path d="M665.08-450H180v-60H665.08L437.23-737.85L480-780L780-480L480-180l-42.77-42.15L665.08-450Z"/></svg>`
      );

      promptRow.appendChild(leftContent);
      promptRow.appendChild(arrowSvg);
      promptList.appendChild(promptRow);
    }

    mainContent.appendChild(promptList);
  }

  // 5. Tabs (Overview / Skills)
  let activeDetailTab: "overview" | "skills" = "overview";

  const tabList = el("div", {
    role: "tablist",
    "aria-label": "Plugin details",
    class: "flex flex-wrap items-center gap-0.5",
  });

  const tabOverview = el(
    "button",
    {
      type: "button",
      role: "tab",
      id: "plugin-detail-tab-overview",
      "aria-selected": "true",
      "aria-controls": "plugin-detail-tabpanel",
      class:
        "agy-pill inline-flex items-center gap-1.5 cursor-pointer h-7 px-3 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary select-none bg-secondary text-foreground",
      onclick: () => switchTab("overview"),
    },
    ["Overview"]
  );

  const tabSkills = el(
    "button",
    {
      type: "button",
      role: "tab",
      id: "plugin-detail-tab-skills",
      "aria-selected": "false",
      "aria-controls": "plugin-detail-tabpanel",
      class:
        "agy-pill inline-flex items-center gap-1.5 cursor-pointer h-7 px-3 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary select-none text-muted-foreground hover:text-foreground",
      onclick: () => switchTab("skills"),
    },
    ["Skills"]
  );

  tabList.appendChild(tabOverview);
  tabList.appendChild(tabSkills);
  mainContent.appendChild(tabList);

  const tabpanel = el("div", {
    id: "plugin-detail-tabpanel",
    role: "tabpanel",
    "aria-labelledby": "plugin-detail-tab-overview",
  });
  mainContent.appendChild(tabpanel);

  let commandsCollapsed = false;

  function renderCommandsSection(): HTMLElement {
    const commands = mod?.commands || [
      { name: `/${modId}`, description: mod?.description || "Execute mod command." },
    ];

    const section = el("section", { class: "flex flex-col gap-3" });
    const countBadge = el(
      "span",
      {
        "data-testid": "customization-section-count",
        class:
          "inline-flex items-center text-[11px] leading-4 px-2 py-0.5 rounded-full shrink-0 font-normal bg-muted text-muted-foreground",
      },
      [String(commands.length)]
    );

    const chevronSvg = createSvgIcon(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
        commandsCollapsed ? "" : "rotate-90"
      }"><path d="M517.85-480l-184-184L376-706.15L602.15-480L376-253.85L333.85-296l184-184Z"/></svg>`
    );

    const toggleBtn = el(
      "button",
      {
        type: "button",
        "aria-expanded": commandsCollapsed ? "false" : "true",
        class: "flex cursor-pointer items-center gap-2 select-none text-left",
        onclick: () => {
          commandsCollapsed = !commandsCollapsed;
          switchTab(activeDetailTab);
        },
      },
      ["Commands", countBadge, chevronSvg]
    );

    const header = el("div", { class: "flex items-center justify-between gap-4 pl-3" }, [
      el("h3", { class: "min-w-0 font-medium text-lg text-foreground" }, [toggleBtn]),
    ]);
    section.appendChild(header);

    const contentDiv = el("div", {
      class: "flex flex-col",
      style: commandsCollapsed ? "display: none;" : "",
    });

    for (const cmd of commands) {
      const cmdRow = el("div", {
        class:
          "group relative flex items-center rounded-lg hover:bg-secondary focus-within:bg-secondary",
      });

      const cmdBtn = el(
        "button",
        {
          type: "button",
          class:
            "w-full min-w-0 px-3 py-1.5 text-left rounded-lg cursor-pointer outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        },
        [
          el("div", { class: "flex items-baseline gap-2.5 min-w-0 pr-14" }, [
            el("span", { class: "font-medium flex-shrink-0 text-foreground" }, [cmd.name]),
            el("span", { class: "text-muted-foreground truncate", title: cmd.description }, [
              cmd.description,
            ]),
          ]),
        ]
      );

      // Copy Action Floating Button on Hover
      const copyBox = el("div", {
        class:
          "absolute top-0 bottom-0 right-0 pr-2 pl-8 flex items-center justify-end gap-1 z-10 rounded-r-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
        style: "background: linear-gradient(to right, transparent 0%, var(--secondary) 25%);",
      });

      const copyBtn = el(
        "button",
        {
          type: "button",
          class:
            "agy-button agy-button-icon inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:text-foreground focus-visible:bg-secondary h-6 w-6 shrink-0 flex items-center justify-center rounded-md",
          "aria-label": `Copy ${cmd.name}`,
          title: `Copy ${cmd.name}`,
          onclick: (e: MouseEvent) => {
            e.stopPropagation();
            if (navigator.clipboard) {
              navigator.clipboard.writeText(cmd.name);
            }
          },
        },
        [
          createSvgIcon(
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="w-4 h-4"><path d="M362.31-260Q332-260 311-281t-21-51.31V-787.69Q290-818 311-839t51.31-21H697.69Q728-860 749-839t21,51.31v455.38Q770-302 749-281t-51.31,21H362.31Zm0-60H697.69q4.62,0 8.46-3.85t3.85-8.46V-787.69q0-4.62-3.85-8.46T697.69-800H362.31q-4.62,0-8.46,3.85T350-787.69v455.38q0,4.62 3.85,8.46t8.46,3.85Zm-140,200Q192-120 171-141t-21-51.31V-677.69q0-12.77 8.62-21.38T180-707.69t21.38,8.62T210-677.69v485.38q0,4.62 3.85,8.46t8.46,3.85H587.69q12.77,0 21.38,8.62T617.69-150t-8.62,21.38T587.69-120H222.31ZM350-320q0,0 0-3.85t0-8.46V-787.69q0-4.62 0-8.46t0-3.85t0,3.85t0,8.46v455.38q0,4.62 0,8.46t0,3.85Z"/></svg>`
          ),
        ]
      );

      copyBox.appendChild(copyBtn);
      cmdRow.appendChild(cmdBtn);
      cmdRow.appendChild(copyBox);
      contentDiv.appendChild(cmdRow);
    }

    section.appendChild(contentDiv);
    return section;
  }

  function switchTab(tab: "overview" | "skills"): void {
    activeDetailTab = tab;

    if (tab === "overview") {
      tabOverview.setAttribute("aria-selected", "true");
      tabOverview.className =
        "agy-pill inline-flex items-center gap-1.5 cursor-pointer h-7 px-3 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary select-none bg-secondary text-foreground";
      tabSkills.setAttribute("aria-selected", "false");
      tabSkills.className =
        "agy-pill inline-flex items-center gap-1.5 cursor-pointer h-7 px-3 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary select-none text-muted-foreground hover:text-foreground";

      tabpanel.innerHTML = "";
      const overviewCol = el("div", { class: "flex flex-col gap-6" });

      // Readme section
      const readmeSec = el("section", { "aria-label": "Readme" });
      const markdownEl = renderMarkdownBody(
        mod?.readme || `### Overview\n${mod?.description || ""}`
      );
      readmeSec.appendChild(markdownEl);
      overviewCol.appendChild(readmeSec);

      // Commands section
      const commandsWrapper = el("div", { class: "-mx-3 flex flex-col gap-6 empty:hidden" });
      commandsWrapper.appendChild(renderCommandsSection());
      overviewCol.appendChild(commandsWrapper);

      tabpanel.appendChild(overviewCol);
    } else {
      tabSkills.setAttribute("aria-selected", "true");
      tabSkills.className =
        "agy-pill inline-flex items-center gap-1.5 cursor-pointer h-7 px-3 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary select-none bg-secondary text-foreground";
      tabOverview.setAttribute("aria-selected", "false");
      tabOverview.className =
        "agy-pill inline-flex items-center gap-1.5 cursor-pointer h-7 px-3 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary select-none text-muted-foreground hover:text-foreground";

      tabpanel.innerHTML = "";
      const skillsCol = el("div", { class: "-mx-3" });
      skillsCol.appendChild(renderCommandsSection());
      tabpanel.appendChild(skillsCol);
    }
  }

  // Initialize with Overview tab
  switchTab("overview");

  // 6. Footer (1:1 with Willow plugin metadata footer)
  const footer = el(
    "footer",
    {
      "aria-label": "Plugin metadata",
      "data-testid": "plugin-detail-footer",
      class: "mt-8 border-t border-border/60 pt-5 text-sm",
    },
    [
      el("div", { class: "flex flex-wrap items-start justify-between gap-x-10 gap-y-4" }, [
        el("dl", { class: "flex flex-wrap items-start gap-x-10 gap-y-4" }, [
          createMetaItem("Version", mod.version || "1.0.0", "plugin-detail-footer-version"),
          createMetaItem("Author", mod.author || "AGY Boost Team"),
          createMetaItem("Runtime Engine", mod.runtime || "WebAssembly / Native Go"),
          createMetaItem("Category", getCategoryLabel(mod.category)),
        ]),
      ]),
    ]
  );

  innerCol.appendChild(mainContent);
  innerCol.appendChild(footer);
  centerWrapper.appendChild(innerCol);
  scrollContainer.appendChild(centerWrapper);
  detailShell.appendChild(scrollContainer);

  container.appendChild(detailShell);
}
