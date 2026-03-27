# EA Dashboard Design System

Dark-theme executive dashboard. All values below are mandatory — new UI code must use only these tokens. Run `/interface-design:audit` to verify compliance.

## Spacing

4px grid. Allowed values (px): `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48`

Applies to: `padding`, `margin`, `gap`, `top/right/bottom/left` offsets.

Exceptions:
- `1px` for inline code padding (`1px 4px`)
- `3px` for micro-badge vertical padding (`3px 8px`)
- `10px` in base `.input` and `.btn-primary` compound padding — legacy, do not introduce new `10px` values

## Border Radius

| Token | Value | Use |
|-|-|-|
| `radius-xs` | `2px` | Progress bars, thin dividers |
| `radius-sm` | `4px` | Tags, source badges, inline code |
| `radius-md` | `6px` | Small buttons (header, type selector), small inputs (search within dropdown) |
| `radius-default` | `8px` | Buttons, inputs, inner cards, list rows |
| `radius-lg` | `12px` | Cards, panels, modals, containers, banners |
| `radius-pill` | `height / 2` | Toggle switches, pill shapes |
| `radius-circle` | `50%` | Dots, avatars, spinners |

No other radius values. In particular: no `5px`, `10px`, `16px`.

## Font Size

Allowed values (px): `9, 10, 11, 12, 13, 14, 16, 20, 24, 28, 48`

| Size | Use |
|-|-|
| `9px` | Micro labels, source badges, type selectors |
| `10px` | Tertiary text, timestamps, dropdown arrows |
| `11px` | Section headers (uppercase), field labels, meta text |
| `12px` | Secondary body, hints, loading/error messages |
| `13px` | Default body, input text, button text |
| `14px` | Card titles, primary body, login button |
| `16px` | Subheadings |
| `20px` | Section headings |
| `24px` | Page headings (ErrorState, secondary) |
| `28px` | Page title (Login) |
| `48px` | Decorative icons (emoji) |

No `13.5px`, `15px`, or other fractional/off-scale sizes.

## Color Palette

### Backgrounds
| Token | Value | Use |
|-|-|-|
| `bg-page` | `#0a0a0f` to `#111827` gradient | Page background (set on `html`) |
| `bg-surface` | `rgba(255,255,255,0.02)` | Cards, containers |
| `bg-surface-hover` | `rgba(255,255,255,0.05)` | Hovered cards/rows |
| `bg-elevated` | `#16161e` | Floating panels, modals, dropdowns — fully opaque, no rgba |
| `bg-input` | `rgba(255,255,255,0.04)` | Input fields, buttons (secondary) |

### Text
| Token | Value | Use |
|-|-|-|
| `text-primary` | `#f1f5f9` / `#f8fafc` | Headings, primary content |
| `text-body` | `#e2e8f0` | Default body text, input values |
| `text-secondary` | `#94a3b8` / `#cbd5e1` | Descriptions, hints, meta |
| `text-muted` | `#64748b` / `#475569` | Placeholders, disabled, tertiary |

### Accent
| Token | Value | Use |
|-|-|-|
| `accent-primary` | `#6366f1` | Primary actions, active states, borders |
| `accent-primary-light` | `#818cf8` / `#a5b4fc` / `#c7d2fe` | Hover text, spinner borders, soft highlights |
| `accent-secondary` | `#8b5cf6` | Gradient endpoint (buttons) |

### Semantic
| Token | Value | Use |
|-|-|-|
| `color-danger` | `#ef4444` / `#fca5a5` | Errors, overdue, destructive actions |
| `color-warning` | `#f59e0b` / `#fcd34d` | Medium urgency, caution |
| `color-success` | `#34d399` | Confirmations, completed states |
| `color-info` | `#22d3ee` | Income, informational |
| `color-orange` | `#f97316` | One-time expenses, Canvas source badge |

**Do not use:** `#fb923c` (use `#f97316`), `#1a1a2e` (use `#16161e`).

### Borders
| Token | Value | Use |
|-|-|-|
| `border-subtle` | `rgba(255,255,255,0.06)` | Card borders, dividers |
| `border-default` | `rgba(255,255,255,0.1)` | Panel borders, elevated surfaces |
| `border-accent` | `rgba(99,102,241,0.2)` | Focused/accent-bordered inputs |

## Shadows

Only three shadow patterns:

| Token | Value | Use |
|-|-|-|
| `shadow-hover` | `0 4px 16px rgba(99,102,241,0.3)` | Button hover lift |
| `shadow-modal` | `0 20px 60px rgba(0,0,0,0.7)` | Floating panels, modals, dropdowns |
| `shadow-ring` | `0 0 0 1px rgba(255,255,255,0.04) inset` | Stacked with modal shadow for edge definition |

No other shadow values. In particular: no `0 8px 32px`, no `0 4px 12px`.

## Component Patterns

### Cards
```
background: rgba(255,255,255,0.02)
border: 1px solid rgba(255,255,255,0.06)
border-radius: 12px
padding: 16px 20px
```

### Inputs
```
background: rgba(255,255,255,0.04)
border: 1px solid rgba(255,255,255,0.1)  /* or accent variant */
border-radius: 8px
padding: 10px 14px  /* base .input */
padding: 8px 12px   /* compact variant (BillBadge) */
font-size: 13px
```

### Buttons
| Tier | Padding | Radius | Font |
|-|-|-|-|
| Primary | `10px 20px` | `8px` | `13px 600` |
| Secondary | `10px 20px` | `8px` | `13px 500` |
| Header | `4px 10px` | `6px` | `11px 500` |
| Danger | `6px 12px` | `8px` | `11px 500` |
| Micro (type selector) | `4px 8px` | `6px` | `9px 700` |

### Floating Panels
Mandatory pattern for all dropdowns, popovers, modals:
1. `createPortal(..., document.body)`
2. `position: "fixed"` with `getBoundingClientRect()` coords
3. `background: "#16161e"` (opaque, not rgba)
4. `border: "1px solid rgba(255,255,255,0.1)"`
5. `borderRadius: 12`
6. `boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset"`
7. `isolation: "isolate"`
8. `overscrollBehavior: "contain"` + wheel boundary trap
9. Click-outside via `pointerdown` on `document`

### Section Headers
```
font-size: 11px
letter-spacing: 2.5px (main) / 1.5px (panel)
text-transform: uppercase
color: #475569 (main) / #94a3b8 (panel)
font-weight: 600
```

## Animations

```css
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
```

Standard transition: `all 0.2s ease` or `all 0.15s ease` for micro-interactions.
Entry animations: `0.2s–0.6s` with `cubic-bezier(0.16,1,0.3,1)` for spring feel.
