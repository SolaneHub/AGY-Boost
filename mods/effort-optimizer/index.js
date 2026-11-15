// Effort Optimizer Mod for AGY Boost
// Dynamic reasoning effort & token budget tuner for Claude & Gemini models.
// Pure vanilla DOM, Willow Design System styling, 100% flexbox invariant safe.

return (function () {
  const EFFORT_LEVELS = [
    { name: "Low", value: 0.2, color: "#10b981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.3)" },
    { name: "Medium", value: 0.5, color: "#0ea5e9", bg: "rgba(14, 165, 233, 0.15)", border: "rgba(14, 165, 233, 0.3)" },
    { name: "High", value: 0.8, color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.3)" },
    { name: "Max", value: 1.0, color: "#ec4899", bg: "rgba(236, 72, 153, 0.15)", border: "rgba(236, 72, 153, 0.3)" },
  ];

  const STORAGE_KEY = "agy_effort_level";
  let memoryLevel = "High";

  function getCurrentIndex() {
    try {
      if (typeof localStorage !== "undefined" && localStorage && localStorage.getItem) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) memoryLevel = saved;
      }
    } catch {}
    const idx = EFFORT_LEVELS.findIndex((l) => l.name.toLowerCase() === (memoryLevel || "high").toLowerCase());
    return idx >= 0 ? idx : 2;
  }

  function setIndex(idx) {
    memoryLevel = EFFORT_LEVELS[idx].name;
    try {
      if (typeof localStorage !== "undefined" && localStorage && localStorage.setItem) {
        localStorage.setItem(STORAGE_KEY, memoryLevel);
      }
    } catch {}
    try {
      const evt = typeof CustomEvent !== "undefined"
        ? new CustomEvent("agy:effort-changed", { detail: EFFORT_LEVELS[idx] })
        : { type: "agy:effort-changed", detail: EFFORT_LEVELS[idx] };
      window.dispatchEvent(evt);
    } catch {}
  }

  function nextLevel() {
    const next = (getCurrentIndex() + 1) % EFFORT_LEVELS.length;
    setIndex(next);
    return EFFORT_LEVELS[next];
  }

  function createEffortButton(slotName = "composer") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "agy-effort-pill";
    btn.setAttribute("data-agy-effort-optimizer", "true");
    btn.setAttribute("data-agy-mod-id", "effort-optimizer");
    btn.setAttribute("data-agy-effort-slot", slotName);
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 500;
      color: #e0e0e0;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
      outline: none;
      box-shadow: none;
      vertical-align: middle;
      font-family: inherit;
      white-space: nowrap;
      flex-shrink: 0;
    `;

    const iconSpan = document.createElement("span");
    iconSpan.style.cssText = "display: flex; align-items: center; margin-right: -2px;";
    iconSpan.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

    const labelSpan = document.createElement("span");
    labelSpan.style.cssText = "color: #9ca3af; font-weight: 500;";
    labelSpan.textContent = "Effort:";

    const badgeSpan = document.createElement("span");
    badgeSpan.className = "agy-effort-badge";
    badgeSpan.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 6px;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 11px;
      transition: all 0.15s ease;
    `;

    const dotSpan = document.createElement("span");
    dotSpan.style.cssText = "width: 6px; height: 6px; border-radius: 50%;";

    const valueSpan = document.createElement("span");

    badgeSpan.appendChild(dotSpan);
    badgeSpan.appendChild(valueSpan);

    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);
    btn.appendChild(badgeSpan);

    function update() {
      const current = EFFORT_LEVELS[getCurrentIndex()];
      iconSpan.style.color = current.color;
      badgeSpan.style.color = current.color;
      badgeSpan.style.background = current.bg;
      badgeSpan.style.border = `1px solid ${current.border}`;
      dotSpan.style.background = current.color;
      dotSpan.style.boxShadow = `0 0 6px ${current.color}`;
      valueSpan.textContent = `${current.name} (${current.value})`;
      btn.title = `⚡ Reasoning Effort: ${current.name} (${current.value})\nClick to cycle: Low (0.2) → Medium (0.5) → High (0.8) → Max (1.0)`;
    }

    btn.onmouseenter = () => {
      btn.style.background = "rgba(255, 255, 255, 0.12)";
      btn.style.borderColor = "rgba(255, 255, 255, 0.24)";
    };
    btn.onmouseleave = () => {
      btn.style.background = "rgba(255, 255, 255, 0.06)";
      btn.style.borderColor = "rgba(255, 255, 255, 0.12)";
    };
    btn.onmousedown = () => {
      btn.style.transform = "scale(0.96)";
    };
    btn.onmouseup = () => {
      btn.style.transform = "scale(1)";
    };

    btn.onclick = (e) => {
      if (e) {
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
      }
      nextLevel();
      update();
    };

    const onStateChanged = () => update();
    window.addEventListener("agy:effort-changed", onStateChanged);

    update();

    return {
      element: btn,
      cleanup: () => {
        window.removeEventListener("agy:effort-changed", onStateChanged);
        btn.remove();
      },
    };
  }

  const cleanups = [];
  const agy = window.AGYBoost || (typeof context !== "undefined" ? context : null);
  const ui = agy && agy.ui;

  // Clean up any existing duplicate buttons before mounting
  const existingComposer = document.querySelector('[data-agy-effort-slot="composer"]');
  if (existingComposer) {
    existingComposer.remove();
  }
  const existingHeader = document.querySelector('[data-agy-effort-slot="header"]');
  if (existingHeader) {
    existingHeader.remove();
  }

  // 1. Mount into Composer Toolbar (Primary chat UI)
  const composerBtn = createEffortButton("composer");
  cleanups.push(composerBtn.cleanup);

  if (ui && typeof ui.mountComposer === "function") {
    const unmountComposer = ui.mountComposer(composerBtn.element);
    cleanups.push(unmountComposer);
  } else {
    function findComposerTarget() {
      const modelTrigger = document.querySelector('[data-testid="model-selector-trigger"]');
      if (modelTrigger) {
        return modelTrigger.closest(".no-focus-agent-input")?.parentElement || modelTrigger.parentElement;
      }
      const permTrigger = document.querySelector('[data-testid="permissions-selector-trigger"]');
      if (permTrigger?.parentElement) {
        return permTrigger.parentElement;
      }
      return document.querySelector('[data-agent-composer-root]') ||
             document.querySelector('.agy-composer-footer') ||
             document.querySelector('[data-testid="agent-input-box"]');
    }

    function attachComposerFallback() {
      const target = findComposerTarget();
      if (target && composerBtn.element.parentElement !== target) {
        target.appendChild(composerBtn.element);
      }
    }

    attachComposerFallback();

    if (typeof MutationObserver !== "undefined") {
      const conv = document.querySelector('[data-testid="conversation-view"]') || document.body || document.documentElement;
      if (conv) {
        const obs = new MutationObserver(() => attachComposerFallback());
        obs.observe(conv, { childList: true, subtree: true });
        cleanups.push(() => obs.disconnect());
      }
    }
  }



  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {}
    }
    // Defensive sweep: remove any leftover buttons for this mod
    try {
      const leftovers = document.querySelectorAll('[data-agy-mod-id="effort-optimizer"], [data-agy-effort-optimizer="true"]');
      for (let i = 0; i < leftovers.length; i++) {
        leftovers[i].remove();
      }
    } catch {}
  };
})();