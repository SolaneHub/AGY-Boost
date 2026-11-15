# Antigravity Theming & Styling Guide

AGY Boost gives you complete native control over the visual appearance, color palette, and UX of Google Antigravity.

You can create themes in two ways:
1. **Pure CSS Mod (Zero Code)**: A simple `mod.json` pointing to a `.css` file.
2. **Dynamic TypeScript Mod**: Control variables, styles, and dynamic DOM reactions programmatically via `AGYBoost.ui`.

---

## 1. Creating a Pure CSS Theme Mod

If you only want to customize colors, fonts, or styling, you do **not** need to write any JavaScript or TypeScript:

```text
my-theme/
├── mod.json
└── theme.css
```

### `mod.json`
```json
{
  "id": "dracula-theme",
  "name": "Dracula Theme",
  "version": "1.0.0",
  "description": "Dracula color palette for Google Antigravity.",
  "author": "Your Name",
  "style": "theme.css"
}
```

### `theme.css`
```css
:root {
  /* Core Background & Foreground */
  --background: #282a36 !important;
  --body-background: #282a36 !important;
  --foreground: #f8f8f2 !important;

  /* Primary Accent & Buttons */
  --primary: #bd93f9 !important;
  --primary-foreground: #282a36 !important;

  /* Secondary & Cards */
  --secondary: #44475a !important;
  --secondary-foreground: #f8f8f2 !important;
  --card: #21222c !important;
  --border: #6272a4 !important;
  --muted: #44475a !important;
  --muted-foreground: #6272a4 !important;

  /* Sidebar */
  --sidebar: #21222c !important;
  --color-sidebar: #21222c !important;
  --sidebar-secondary: #44475a !important;
  --sidebar-muted: #383a59 !important;

  /* Syntax Highlighting in Code Blocks */
  --syntax-keyword: #ff79c6 !important;
  --syntax-string: #f1fa8c !important;
  --syntax-function: #50fa7b !important;
  --syntax-variable: #f8f8f2 !important;
  --syntax-number: #bd93f9 !important;
  --syntax-comment: #6272a4 !important;
  --syntax-operator: #ff79c6 !important;
  --syntax-constant: #bd93f9 !important;
}
```

---

## 2. Complete Catalog of Antigravity CSS Variables

These variables are extracted directly from Google Antigravity's live rendering engine.

### Surfaces & Layout
| CSS Variable | Description |
| --- | --- |
| `--background` | Main window and application background |
| `--body-background` | Canvas body background |
| `--foreground` | Default text color |
| `--card` | Background color for cards, panels, and floating modals |
| `--card-border` | Border color for cards and dialogs |
| `--card-radius` | Corner radius for cards (e.g. `16px`) |
| `--border` | Dividers, line borders, and container edges |
| `--muted` | Subdued surface backgrounds |
| `--muted-foreground` | Secondary, hint, and timestamp text |
| `--glass` / `--glass-border` | Glassmorphism surfaces and translucent overlays |

### Navigation & Sidebar
| CSS Variable | Description |
| --- | --- |
| `--sidebar` | Left navigation sidebar background |
| `--color-sidebar` | Alternate sidebar background container |
| `--sidebar-secondary` | Background of the currently active/selected navigation item |
| `--sidebar-muted` | Background on hover for idle navigation items |
| `--sidebar-width` | Width of the sidebar (e.g. `240px`) |

### Primary Accent & Controls
| CSS Variable | Description |
| --- | --- |
| `--primary` | Main action buttons, active pills, and focus highlights |
| `--primary-foreground` | Text color on primary buttons |
| `--secondary` | Inactive pills, chips, and secondary buttons |
| `--secondary-foreground` | Text color on secondary buttons |
| `--link` / `--cta` | Hyperlinks and call-to-action buttons |
| `--focus-ring-color` | Outline glow when clicking or focusing an input |

### Code & Syntax Highlighting
Antigravity styles code snippets and syntax highlighting in conversation messages using these tokens:
| CSS Variable | Description |
| --- | --- |
| `--syntax-keyword` | Language keywords (`const`, `function`, `return`, `class`) |
| `--syntax-string` | String literals (`"text"`, `'path'`) |
| `--syntax-function` | Function and method identifiers |
| `--syntax-variable` | Variable names and parameters |
| `--syntax-number` | Numerical literals (`42`, `3.14`) |
| `--syntax-comment` | Code comments (`// ...`, `/* ... */`) |
| `--syntax-constant` | Boolean and constant values (`true`, `null`, `nil`) |
| `--syntax-operator` | Mathematical and logical operators (`+`, `-`, `=`, `=>`) |
| `--syntax-punctuation` | Brackets, commas, semicolons (`{`, `}`, `;`) |
| `--syntax-class-name` | Class, interface, and struct names |

### Feedback & Status
| CSS Variable | Description |
| --- | --- |
| `--success` | Green indicators and success toasts |
| `--warning` | Yellow/amber warnings |
| `--error` | Red error messages and destructive button states |
| `--bg-selection` | Background color of highlighted/selected text |

---

## 3. Dynamic Theming with TypeScript

When building a mod in TypeScript, use the typed methods provided on `AGYBoost.ui`:

```typescript
// 1. Programmatic theme setting with automatic type inference
const removeTheme = AGYBoost.ui.setTheme({
  "--primary": "#6366f1",
  "--background": "#0f172a",
  "--card": "#1e293b",
  "--sidebar": "#0f172a",
  "--syntax-keyword": "#ec4899",
  "--syntax-string": "#10b981",
});

// 2. Inject dynamic styles at runtime
const removeCSS = AGYBoost.ui.injectCSS(`
  .composer-input:focus {
    box-shadow: 0 0 15px rgba(99, 102, 241, 0.4) !important;
  }
`);

// 3. React to dynamic elements as they appear
const stopObserver = AGYBoost.ui.observe(".message-bubble", (bubble) => {
  bubble.style.transition = "all 0.2s ease";
});

// 4. Automatically clean up when the mod is disabled
if (typeof mod !== "undefined" && mod.onDispose) {
  mod.onDispose(() => {
    removeTheme();
    removeCSS();
    stopObserver();
  });
}
```

---

## 4. Layout Protection (Important Safety Rule)

When modifying CSS or adding overlay views:
- **NEVER set inline `display: block` on `[data-testid="conversation-view"]`** (this is a Tailwind flex column; forcing `display: block` collapses the message scroller).
- Always use `display: flex !important` or leave the display attribute empty (`""`) to inherit Antigravity's native Tailwind classes.
