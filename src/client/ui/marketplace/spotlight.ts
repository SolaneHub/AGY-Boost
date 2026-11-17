// AGY Boost Spotlight Carousel (Modularized & Lifecycle-Optimized)

import { el } from "../dom.js";
import type { DaemonBridge } from "../../bridge/daemon.js";
import { getMarketplaceMod } from "./catalog.js";

interface SpotlightMetadata {
  id: string;
  left: string;
  top: string;
  rotate: string;
  swayAnimation: string;
}

export const SPOTLIGHT_MODS_METADATA: SpotlightMetadata[] = [
  {
    id: "effort-optimizer",
    left: "12%",
    top: "35%",
    rotate: "-4deg",
    swayAnimation:
      "7.2s cubic-bezier(0.37, 0, 0.63, 1) -1.3s infinite alternate none running agy-spotlight-sway",
  },
  {
    id: "stream-accel",
    left: "27%",
    top: "66%",
    rotate: "3deg",
    swayAnimation:
      "8.6s cubic-bezier(0.37, 0, 0.63, 1) -4.1s infinite alternate none running agy-spotlight-sway",
  },
  {
    id: "context-compressor",
    left: "42%",
    top: "32%",
    rotate: "-2deg",
    swayAnimation:
      "6.4s cubic-bezier(0.37, 0, 0.63, 1) -2.6s infinite alternate none running agy-spotlight-sway",
  },
  {
    id: "theme-oled",
    left: "58%",
    top: "64%",
    rotate: "0deg",
    swayAnimation:
      "9.4s cubic-bezier(0.37, 0, 0.63, 1) -6s infinite alternate none running agy-spotlight-sway",
  },
  {
    id: "local-llm-bridge",
    left: "73%",
    top: "34%",
    rotate: "-3deg",
    swayAnimation:
      "7.8s cubic-bezier(0.37, 0, 0.63, 1) -0.4s infinite alternate none running agy-spotlight-sway",
  },
  {
    id: "git-worktree",
    left: "88%",
    top: "63%",
    rotate: "2deg",
    swayAnimation:
      "8.2s cubic-bezier(0.37, 0, 0.63, 1) -3.3s infinite alternate none running agy-spotlight-sway",
  },
];

export const SPOTLIGHT_STYLE = `
@keyframes agy-spotlight-sway { from { transform: translateY(-3px) rotate(-2deg); } to { transform: translateY(3px) rotate(2deg); } }
@keyframes agy-spotlight-progress { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
@keyframes agy-spotlight-ring-in { from { opacity: 0; } to { opacity: 1; } }
.agy-spotlight-host { container: agy-spotlight / inline-size; width: 100%; }
.agy-spotlight-progress-ring { stroke-dashoffset: 100; animation: agy-spotlight-progress 4000ms linear forwards; }
.agy-spotlight-host:hover .agy-spotlight-progress-running, .agy-spotlight-host:focus-within .agy-spotlight-progress-running { animation-play-state: paused; }
.agy-spotlight-card { display: flex; flex-direction: column; height: auto; border-radius: 24px; }
.agy-spotlight-stage { position: relative; display: block; width: 100%; height: 176px; flex: none; overflow: hidden; isolation: isolate; }
.agy-spotlight-panel { display: flex; flex-direction: column; justify-content: center; width: 100%; padding: 18px 24px 20px; flex-shrink: 0; min-width: 0; }
.agy-spotlight-tile { width: clamp(46px, 11.5cqw, 58px); height: clamp(46px, 11.5cqw, 58px); }
.agy-spotlight-tile:focus-visible .agy-spotlight-progress-ring { animation: none; stroke-dashoffset: 0; }
@container agy-spotlight (min-width: 580px) {
  .agy-spotlight-card { flex-direction: row; height: 248px; }
  .agy-spotlight-stage { width: auto; height: 100%; flex: 1 1 0%; }
  .agy-spotlight-panel { width: clamp(268px, 42.1cqw, 350px); padding: 0 clamp(20px, 3.85cqw, 32px); }
  .agy-spotlight-tile { width: clamp(50px, 7.7cqw, 64px); height: clamp(50px, 7.7cqw, 64px); }
}
@media (prefers-reduced-motion: reduce) {
  .agy-spotlight-sway-shell, .agy-spotlight-ring-svg, .agy-spotlight-progress-ring { animation: none !important; }
  .agy-spotlight-progress-ring { stroke-dashoffset: 0 !important; }
}
.no-animations .agy-spotlight-sway-shell, .no-animations .agy-spotlight-ring-svg, .no-animations .agy-spotlight-progress-ring { animation: none !important; }
.no-animations .agy-spotlight-progress-ring { stroke-dashoffset: 0 !important; }
`;

let activeFeaturedIndex = 0;
let spotlightTimer: ReturnType<typeof setInterval> | null = null;
let spotlightPaused = false;
let visibilityListenerRegistered = false;

export function stopSpotlightTimer(): void {
  if (spotlightTimer !== null) {
    clearInterval(spotlightTimer);
    spotlightTimer = null;
  }
}

export function startSpotlightTimer(updateFn: () => void): void {
  stopSpotlightTimer();
  spotlightPaused = false;

  setupVisibilityListener();

  spotlightTimer = setInterval(() => {
    if (!(spotlightPaused || document.hidden)) {
      activeFeaturedIndex = (activeFeaturedIndex + 1) % SPOTLIGHT_MODS_METADATA.length;
      updateFn();
    }
  }, 4000);
}

function setupVisibilityListener(): void {
  if (visibilityListenerRegistered) return;
  visibilityListenerRegistered = true;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      spotlightPaused = true;
    } else {
      spotlightPaused = false;
    }
  });
}

function createSpotlightRingSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "agy-spotlight-ring-svg pointer-events-none overflow-visible");
  svg.style.cssText =
    "position: absolute; inset: 0px; width: 100%; height: 100%; animation: 240ms ease-out 0s 1 normal none running agy-spotlight-ring-in;";

  const rectBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rectBg.setAttribute("x", "0");
  rectBg.setAttribute("y", "0");
  rectBg.setAttribute("width", "100%");
  rectBg.setAttribute("height", "100%");
  rectBg.setAttribute("rx", "18");
  rectBg.setAttribute("ry", "18");
  rectBg.setAttribute("fill", "none");
  rectBg.setAttribute("stroke-width", "2.5");
  rectBg.style.cssText = "stroke: var(--primary); stroke-opacity: 0.24;";

  const rectProgress = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rectProgress.setAttribute("x", "0");
  rectProgress.setAttribute("y", "0");
  rectProgress.setAttribute("width", "100%");
  rectProgress.setAttribute("height", "100%");
  rectProgress.setAttribute("rx", "18");
  rectProgress.setAttribute("ry", "18");
  rectProgress.setAttribute("fill", "none");
  rectProgress.setAttribute("stroke-width", "2.5");
  rectProgress.setAttribute("stroke-linecap", "round");
  rectProgress.setAttribute("pathLength", "100");
  rectProgress.setAttribute("stroke-dasharray", "100");
  rectProgress.setAttribute("class", "agy-spotlight-progress-ring agy-spotlight-progress-running");
  rectProgress.style.cssText = "stroke: var(--primary);";

  svg.appendChild(rectBg);
  svg.appendChild(rectProgress);
  return svg;
}

export function renderSpotlightHost(
  _bridge: DaemonBridge,
  onNavigateToInstalled: () => void,
  onOpenDetail?: (modId: string) => void,
): HTMLElement {
  const host = el("section", {
    "aria-label": "Featured",
    "data-testid": "featured-carousel",
    "data-picked": "false",
    class: "agy-spotlight-host",
  });

  const styleTag = document.createElement("style");
  styleTag.textContent = SPOTLIGHT_STYLE;
  host.appendChild(styleTag);

  const card = el("div", {
    class: "agy-spotlight-card relative border border-border bg-card overflow-hidden",
  });

  const stage = el("div", {
    role: "tablist",
    "aria-label": "Mods in Featured",
    "data-testid": "featured-carousel-stage",
    class: "agy-spotlight-stage",
  });

  // Light & Dark ambient radial gradients
  const lightBg = el("div", {
    "aria-hidden": "true",
    class: "absolute inset-0 -z-10 dark:hidden",
    style:
      "background: radial-gradient(60% 75% at 15% 40%, rgba(91, 140, 255, 0.3), rgba(91, 140, 255, 0) 70%), radial-gradient(55% 65% at 90% 90%, rgba(47, 75, 230, 0.18), rgba(47, 75, 230, 0) 70%), rgb(243, 245, 252);",
  });
  const darkBg = el("div", {
    "aria-hidden": "true",
    class: "absolute inset-0 -z-10 hidden dark:block",
    style:
      "background: radial-gradient(60% 75% at 15% 40%, rgba(91, 140, 255, 0.5), rgba(91, 140, 255, 0) 70%), radial-gradient(55% 65% at 90% 90%, rgba(47, 75, 230, 0.5), rgba(47, 75, 230, 0) 70%), rgb(17, 22, 40);",
  });
  stage.appendChild(lightBg);
  stage.appendChild(darkBg);

  const tileButtons: HTMLElement[] = [];
  const swayShells: HTMLElement[] = [];

  // Resolve spotlight items dynamically from catalog
  const spotlightItems = SPOTLIGHT_MODS_METADATA.map((meta) => {
    const catalogItem = getMarketplaceMod(meta.id);
    return {
      ...meta,
      name: catalogItem?.name ?? meta.id,
      description: catalogItem?.description ?? "",
      iconBg: catalogItem?.iconBg ?? "",
      iconSvg: catalogItem?.iconSvg
        ? catalogItem.iconSvg.replace(/width="24"\s+height="24"/u, 'width="28" height="28"')
        : "",
    };
  });

  spotlightItems.forEach((mod, idx) => {
    const isAct = idx === activeFeaturedIndex;
    const tileBtn = el("button", {
      type: "button",
      role: "tab",
      id: `agy-spotlight-tab-${idx}`,
      "data-testid": "featured-carousel-member-tile",
      "data-member-name": mod.name,
      "aria-selected": isAct ? "true" : "false",
      "aria-controls": "agy-spotlight-panel-content",
      "aria-label": mod.name,
      title: mod.name,
      tabindex: isAct ? "0" : "-1",
      class: isAct
        ? "agy-spotlight-tile no-focus-ring absolute rounded-[18px] cursor-pointer transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none z-10 opacity-100"
        : "agy-spotlight-tile no-focus-ring absolute rounded-[18px] cursor-pointer transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none opacity-80 hover:opacity-100",
      style: `left: ${mod.left}; top: ${mod.top}; transform: translate(-50%, -50%) rotate(${mod.rotate}) scale(${isAct ? "1.12" : "1"}); cursor: pointer;`,
      onclick: () => {
        activeFeaturedIndex = idx;
        updateSpotlightUi();
        startSpotlightTimer(updateSpotlightUi);
      },
    });

    const swayShell = el("span", {
      class: isAct
        ? "agy-spotlight-sway-shell relative flex items-center justify-center w-full h-full rounded-[18px] bg-card shadow-[0_14px_32px_rgba(15,23,42,0.18)] dark:shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        : "agy-spotlight-sway-shell relative flex items-center justify-center w-full h-full rounded-[18px] bg-card ring-1 ring-border shadow-[0_8px_20px_rgba(15,23,42,0.10)] dark:shadow-[0_12px_26px_rgba(0,0,0,0.40)]",
      style: `animation: ${mod.swayAnimation};`,
    });

    const iconWrapper = el("div", {
      class: `flex items-center justify-center flex-shrink-0 overflow-hidden w-[64%] h-[64%] rounded-[10px] ${mod.iconBg}`,
    });
    iconWrapper.innerHTML = mod.iconSvg;
    swayShell.appendChild(iconWrapper);

    if (isAct) {
      swayShell.appendChild(createSpotlightRingSvg());
    }

    tileBtn.appendChild(swayShell);
    stage.appendChild(tileBtn);

    tileButtons.push(tileBtn);
    swayShells.push(swayShell);
  });

  // Panel
  const panel = el("div", {
    id: "agy-spotlight-panel-content",
    role: "tabpanel",
    "aria-labelledby": `agy-spotlight-tab-${activeFeaturedIndex}`,
    class: "agy-spotlight-panel",
  });

  const eyebrow = el(
    "div",
    {
      "data-testid": "featured-carousel-eyebrow",
      class: "h-5 flex items-center min-w-0 mb-1.5",
    },
    [el("span", { class: "text-sm font-medium text-muted-foreground truncate" }, ["Featured"])],
  );
  panel.appendChild(eyebrow);

  const panelGrid = el("div", { class: "grid grid-cols-1 items-start min-w-0" });
  const panelCards: HTMLElement[] = [];

  spotlightItems.forEach((mod, idx) => {
    const isAct = idx === activeFeaturedIndex;
    const cardEl = el("div", {
      "aria-hidden": isAct ? "false" : "true",
      class: "col-start-1 row-start-1 min-w-0 flex flex-col",
      style: isAct
        ? "opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 200ms ease-out 140ms, visibility;"
        : "opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 140ms ease-in, visibility linear 140ms;",
    });

    const titleH3 = el(
      "h3",
      {
        class:
          "text-2xl leading-tight font-semibold tracking-tight text-foreground m-0 truncate cursor-pointer hover:underline",
        "data-testid": isAct ? "featured-carousel-headline" : undefined,
        onclick: () => {
          if (onOpenDetail) {
            onOpenDetail(mod.id);
          } else {
            onNavigateToInstalled();
          }
        },
      },
      [mod.name],
    );

    const descP = el(
      "p",
      {
        class: "mt-2.5 text-sm leading-relaxed text-muted-foreground m-0 line-clamp-3",
        title: mod.description,
        "data-testid": isAct ? "featured-carousel-description" : undefined,
      },
      [mod.description],
    );

    const actionsDiv = el("div", {
      class: "mt-4 flex items-center gap-2",
      "data-testid": isAct ? "featured-carousel-actions" : undefined,
    });

    const addBtnSpan = el("span", {
      class: "inline-flex items-center min-h-7",
      "data-testid": isAct ? "featured-carousel-primary-action" : undefined,
    });

    const addBtn = el("button", {
      type: "button",
      class:
        "agy-button agy-button-sm inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-primary text-primary-foreground hover:opacity-90 shadow-sm border-none h-7 text-base rounded-md gap-1.5 pl-2 pr-3 focus-visible:ring-2 focus-visible:ring-primary",
      "aria-label": `Add ${mod.name}`,
      tabindex: isAct ? "0" : "-1",
      onclick: () => {
        onNavigateToInstalled();
      },
    });
    addBtn.innerHTML = `<span class="shrink-0 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" class="-mr-1"><path d="M450-450H250q-12.75,0-21.37-8.63T220-480.01t8.62-21.37T250-510H450V-710q0-12.75 8.63-21.37T480.01-740t21.37,8.62T510-710v200H710q12.75,0 21.37,8.63T740-479.99t-8.62,21.37T710-450H510v200q0,12.75-8.63,21.37T479.99-220t-21.37-8.62T450-250V-450Z"/></svg></span>Add`;
    addBtnSpan.appendChild(addBtn);

    const detailsBtn = el(
      "button",
      {
        type: "button",
        class:
          "agy-button agy-button-sm inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-secondary text-secondary-foreground hover:text-foreground border-none h-7 text-base rounded-md gap-1.5 px-2.5 no-underline focus-visible:ring-2 focus-visible:ring-primary",
        tabindex: isAct ? "0" : "-1",
        onclick: () => {
          if (onOpenDetail) {
            onOpenDetail(mod.id);
          } else {
            onNavigateToInstalled();
          }
        },
      },
      ["Details"],
    );

    actionsDiv.appendChild(addBtnSpan);
    actionsDiv.appendChild(detailsBtn);

    cardEl.appendChild(titleH3);
    cardEl.appendChild(descP);
    cardEl.appendChild(actionsDiv);
    panelGrid.appendChild(cardEl);
    panelCards.push(cardEl);
  });

  panel.appendChild(panelGrid);

  card.appendChild(stage);
  card.appendChild(panel);
  host.appendChild(card);

  function updateSpotlightUi(): void {
    spotlightItems.forEach((mod, idx) => {
      const isAct = idx === activeFeaturedIndex;
      const tileBtn = tileButtons[idx];
      const swayShell = swayShells[idx];
      const panelCard = panelCards[idx];

      if (!(tileBtn && swayShell && panelCard)) return;

      tileBtn.setAttribute("aria-selected", isAct ? "true" : "false");
      tileBtn.setAttribute("tabindex", isAct ? "0" : "-1");
      tileBtn.className = isAct
        ? "agy-spotlight-tile no-focus-ring absolute rounded-[18px] cursor-pointer transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none z-10 opacity-100"
        : "agy-spotlight-tile no-focus-ring absolute rounded-[18px] cursor-pointer transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none opacity-80 hover:opacity-100";
      tileBtn.style.transform = `translate(-50%, -50%) rotate(${mod.rotate}) scale(${isAct ? "1.12" : "1"})`;
      tileBtn.style.cursor = "pointer";

      swayShell.className = isAct
        ? "agy-spotlight-sway-shell relative flex items-center justify-center w-full h-full rounded-[18px] bg-card shadow-[0_14px_32px_rgba(15,23,42,0.18)] dark:shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        : "agy-spotlight-sway-shell relative flex items-center justify-center w-full h-full rounded-[18px] bg-card ring-1 ring-border shadow-[0_8px_20px_rgba(15,23,42,0.10)] dark:shadow-[0_12px_26px_rgba(0,0,0,0.40)]";

      // Progress Ring
      const existingRing = swayShell.querySelector(".agy-spotlight-ring-svg");
      if (isAct) {
        if (existingRing) existingRing.remove();
        swayShell.appendChild(createSpotlightRingSvg());
      } else if (existingRing) existingRing.remove();

      // Panel card transition
      panelCard.setAttribute("aria-hidden", isAct ? "false" : "true");
      panelCard.style.opacity = isAct ? "1" : "0";
      panelCard.style.visibility = isAct ? "visible" : "hidden";
      panelCard.style.pointerEvents = isAct ? "auto" : "none";
      panelCard.style.transition = isAct
        ? "opacity 200ms ease-out 140ms, visibility"
        : "opacity 140ms ease-in, visibility linear 140ms";

      // Dynamic testids matching native Antigravity spotlight
      const titleH3 = panelCard.querySelector("h3");
      if (titleH3) {
        if (isAct) titleH3.setAttribute("data-testid", "featured-carousel-headline");
        else titleH3.removeAttribute("data-testid");
      }
      const descP = panelCard.querySelector("p");
      if (descP) {
        if (isAct) descP.setAttribute("data-testid", "featured-carousel-description");
        else descP.removeAttribute("data-testid");
      }
      const actionsDiv = panelCard.querySelector(".mt-4");
      if (actionsDiv) {
        if (isAct) actionsDiv.setAttribute("data-testid", "featured-carousel-actions");
        else actionsDiv.removeAttribute("data-testid");
      }
      const primarySpan = panelCard.querySelector(".min-h-7");
      if (primarySpan) {
        if (isAct) primarySpan.setAttribute("data-testid", "featured-carousel-primary-action");
        else primarySpan.removeAttribute("data-testid");
      }

      const addBtn = panelCard.querySelector<HTMLButtonElement>(
        '[data-testid="featured-carousel-primary-action"] button, .min-h-7 button',
      );
      if (addBtn) addBtn.setAttribute("tabindex", isAct ? "0" : "-1");
      const detailsBtn = panelCard.querySelector<HTMLButtonElement>(".mt-4 > button");
      if (detailsBtn) detailsBtn.setAttribute("tabindex", isAct ? "0" : "-1");
    });

    panel.setAttribute("aria-labelledby", `agy-spotlight-tab-${activeFeaturedIndex}`);
  }

  // Hover pauses auto-advance
  host.addEventListener("mouseenter", () => {
    spotlightPaused = true;
  });
  host.addEventListener("mouseleave", () => {
    spotlightPaused = false;
  });

  // Start auto-advance timer
  startSpotlightTimer(updateSpotlightUi);

  return host;
}
