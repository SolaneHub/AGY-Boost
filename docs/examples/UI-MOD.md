# Guide: Pure TypeScript UI Mod

This guide demonstrates how to build a native UI mod for Google Antigravity using **Pure TypeScript** with zero heavy framework overhead (no React, Vue, or bulky bundlers).

---

## 1. Mod Manifest (`mod.json`)

Create a folder named `my-ui-mod` in your AGY Boost mods directory and add `mod.json`:

```json
{
  "id": "my-ui-mod",
  "name": "Minimal Status Pill",
  "version": "1.0.0",
  "description": "Displays an unobtrusive real-time status pill styled with Antigravity's Willow Design System.",
  "author": "Your Name",
  "main": "index.js"
}
```

---

## 2. Mod Script (`index.js`)

In `index.js`, use the `AGYBoost.ui.el` DOM builder to construct and mount elements with Antigravity's native Tailwind CSS classes:

```typescript
// Pure TypeScript / JavaScript UI Mod
// Injects a native status pill into Antigravity using Willow Design System classes

const statusPill = AGYBoost.ui.el(
  "div",
  {
    id: "my-status-pill",
    class:
      "fixed bottom-3 right-3 bg-secondary text-secondary-foreground text-xs px-3 py-1.5 rounded-full shadow-md z-50 flex items-center gap-2 border border-border select-none",
  },
  [
    AGYBoost.ui.el("span", { class: "w-2 h-2 rounded-full bg-emerald-500 animate-pulse" }),
    AGYBoost.ui.el("span", { class: "font-medium" }, ["AGY Boost Native Mod Active"]),
  ],
);

document.body.appendChild(statusPill);

// Lifecycle cleanup when mod is disabled or updated
if (typeof mod !== "undefined" && mod.onDispose) {
  mod.onDispose(() => {
    statusPill.remove();
  });
}
```

---

## 3. Willow Design System Styling Cheat Sheet

Antigravity provides standard Tailwind utility classes that adapt seamlessly to the user's active theme:

| Element              | Recommended Tailwind Classes                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| **Surfaces & Cards** | `bg-card text-card-foreground border border-border rounded-xl`                                            |
| **Pills & Badges**   | `bg-secondary text-secondary-foreground px-2.5 py-1 rounded-full text-xs font-medium`                     |
| **Accent Badges**    | `bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs`                                               |
| **Buttons**          | `px-3 py-1.5 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors` |
| **Muted Text**       | `text-muted-foreground text-xs`                                                                           |

---

## 4. Testing Your Mod

1. Copy the `my-ui-mod` folder to `~/Library/Application Support/AGYBoost/mods/` (macOS) or `%APPDATA%\AGYBoost\mods\` (Windows).
2. Open Antigravity and navigate to **AGY Boost Mods** in the sidebar.
3. Your mod will be listed and can be enabled or disabled with one click.
