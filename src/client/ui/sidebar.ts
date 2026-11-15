// AGY Boost Sidebar Button Injector (Willow Design System)

import { openModsView, isModsViewOpen, closeModsView } from "./mods-view.js";
import { DaemonBridge } from "../bridge/daemon.js";

const BUTTON_ATTR = "data-agy-boost-mods-btn";
let previousActiveNav: HTMLElement | null = null;

export function updateSidebarActiveState(isActive: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>(`[${BUTTON_ATTR}]`);
  if (!btn) return;

  if (isActive) {
    // Save and de-emphasize any currently active nav item in the sidebar
    const currentActive = document.querySelector<HTMLElement>(
      '[role="navigation"] .bg-sidebar-secondary'
    );
    if (currentActive && currentActive !== btn) {
      previousActiveNav = currentActive;
      currentActive.classList.remove("bg-sidebar-secondary", "text-foreground");
      currentActive.classList.add("bg-transparent", "text-secondary-foreground");
    }

    btn.classList.remove("bg-transparent", "text-secondary-foreground", "hover:bg-sidebar-muted");
    btn.classList.add("bg-sidebar-secondary", "text-foreground");
  } else {
    btn.classList.remove("bg-sidebar-secondary", "text-foreground");
    btn.classList.add("bg-transparent", "text-secondary-foreground", "hover:bg-sidebar-muted");

    if (previousActiveNav && previousActiveNav.isConnected) {
      previousActiveNav.classList.remove("bg-transparent", "text-secondary-foreground");
      previousActiveNav.classList.add("bg-sidebar-secondary", "text-foreground");
      previousActiveNav = null;
    }
  }
}

export function mountSidebarButton(bridge: DaemonBridge): void {
  const tryMount = () => {
    const existing = document.querySelector<HTMLButtonElement>(`[${BUTTON_ATTR}]`);
    if (existing) {
      existing.onclick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isModsViewOpen()) {
          closeModsView();
        } else {
          openModsView(bridge);
        }
      };
      return;
    }

    // Look for sidebar navigation items container
    let targetNav = document.querySelector<HTMLElement>('[data-testid="sidebar-navigation-items"]');
    if (!targetNav) {
      const newConv = document.querySelector<HTMLElement>('[data-testid="new-conversation-button"]');
      if (newConv?.parentElement) {
        targetNav = newConv.parentElement;
      }
    }

    if (!targetNav) {
      const nav = document.querySelector('[role="navigation"]');
      if (nav) {
        const items = nav.querySelector<HTMLElement>('[data-testid="sidebar-navigation-items"], .flex.flex-col');
        if (items) targetNav = items;
      }
    }

    if (!targetNav) return;

    // Create Willow styled Mods button
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute(BUTTON_ATTR, "true");
    btn.className = "agy-button agy-button-custom inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer disabled:opacity-50 flex-grow w-full justify-start font-normal min-w-0 gap-1.5 px-2 rounded-lg py-1.5 bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground";
    
    // Puzzle / Mod icon SVG
    const iconSpan = document.createElement("span");
    iconSpan.className = "shrink-0 flex items-center";
    iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c0-1.57.802-2.54 1.561-2.85-1.561-.92-3.565-.63-4.5.5-1.07 1.28-1.5 2.5-3.5 2.5s-2.43-1.22-3.5-2.5c-.935-1.13-2.939-1.42-4.5-.5.759.31 1.561 1.28 1.561 2.85 0 1.93-1.61 3.5-3.561 3.5v3.3c1.951 0 3.561 1.57 3.561 3.5 0 1.57-.802 2.54-1.561 2.85 1.561.92 3.565.63 4.5-.5 1.07-1.28 1.5-2.5 3.5-2.5s2.43 1.22 3.5 2.5c.935 1.13 2.939 1.42 4.5.5-.759-.31-1.561-1.28-1.561-2.85 0-1.93 1.61-3.5 3.561-3.5v-3.3c-1.951 0-3.561-1.57-3.561-3.5Z"/></svg>`;

    const labelSpan = document.createElement("span");
    labelSpan.className = "truncate";
    labelSpan.textContent = "Mods";

    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);

    btn.onclick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isModsViewOpen()) {
        closeModsView();
      } else {
        openModsView(bridge);
      }
    };

    targetNav.appendChild(btn);
  };

  tryMount();

  // Close mods view if user clicks any other link or button in the sidebar
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const sidebar = document.querySelector('[role="navigation"]');
    if (sidebar && sidebar.contains(target) && !target.closest(`[${BUTTON_ATTR}]`)) {
      if (isModsViewOpen()) {
        closeModsView();
      }
    }
  }, true);

  // MutationObserver to re-mount if DOM dynamically changes (e.g. route change)
  let pendingMountRaf = 0;
  const scheduleMount = () => {
    if (!pendingMountRaf) {
      pendingMountRaf = requestAnimationFrame(() => {
        pendingMountRaf = 0;
        tryMount();
        // If sidebar container was not mounted yet, ensure we attach observer to it once available
        attachSidebarObserver();
      });
    }
  };

  let sidebarObserver: MutationObserver | null = null;
  let bodyMountObserver: MutationObserver | null = null;

  const attachSidebarObserver = () => {
    const sidebarContainer = document.querySelector<HTMLElement>(
      '[data-testid="sidebar-navigation-items"], [role="navigation"]'
    );

    if (sidebarContainer) {
      if (bodyMountObserver) {
        bodyMountObserver.disconnect();
        bodyMountObserver = null;
      }
      if (!sidebarObserver) {
        sidebarObserver = new MutationObserver(scheduleMount);
        sidebarObserver.observe(sidebarContainer, { childList: true, subtree: true });
      }
    } else if (!bodyMountObserver) {
      bodyMountObserver = new MutationObserver(scheduleMount);
      bodyMountObserver.observe(document.body || document.documentElement, {
        childList: true,
      });
    }
  };

  attachSidebarObserver();
}
