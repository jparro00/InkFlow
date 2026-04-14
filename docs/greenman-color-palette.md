# Green Man Tattoo — M2 Dark Theme Color Palette

Style: **Bold & edgy** | M2 dark theme compliant | Brand green derived from logo

## M2 Color Slots (12 roles)

| Slot                | Hex                        | Usage                                     |
|---------------------|----------------------------|--------------------------------------------|
| **Primary**         | `#4ADE80`                  | Main brand actions, links, highlights, nav |
| **Primary Variant** | `#16A34A`                  | Pressed/active states, status bar          |
| **On Primary**      | `#000000`                  | Text/icons on primary green                |
| **Secondary**       | `#FBBF24`                  | FABs, selection, secondary accents         |
| **Secondary Variant** | `#D97706`                | Pressed/active states for secondary        |
| **On Secondary**    | `#000000`                  | Text/icons on amber                        |
| **Background**      | `#121212`                  | Window/page background                     |
| **On Background**   | `rgba(255, 255, 255, 0.87)` | High emphasis text on background          |
| **Surface**         | `#121212`                  | Cards, sheets, menus, dialogs              |
| **On Surface**      | `rgba(255, 255, 255, 0.87)` | High emphasis text on surfaces            |
| **Error**           | `#CF6679`                  | Error states, destructive actions          |
| **On Error**        | `#000000`                  | Text/icons on error color                  |

## Surface Elevation System (M2 standard)

White overlay on `#121212` base — higher elevation = lighter surface.

| Elevation | White Overlay | Resulting Hex | Typical Components               |
|-----------|---------------|---------------|-----------------------------------|
| 0dp       | 0%            | `#121212`     | Page background                   |
| 1dp       | 5%            | `#1E1E1E`     | Cards, switch                     |
| 2dp       | 7%            | `#232323`     | Buttons (resting)                 |
| 3dp       | 8%            | `#252525`     | Refresh indicator                 |
| 4dp       | 9%            | `#272727`     | Top app bar                       |
| 6dp       | 11%           | `#2C2C2C`     | Snackbar, FAB, input fields       |
| 8dp       | 12%           | `#2E2E2E`     | Bottom bar, menus, cards (dragged)|
| 12dp      | 14%           | `#333333`     | Borders, subtle dividers          |
| 16dp      | 15%           | `#363636`     | Nav drawer, bottom sheet          |
| 24dp      | 16%           | `#383838`     | Dialog, strong dividers           |

## Text & Icon Opacity

| Level           | Value                        | Usage                       |
|-----------------|------------------------------|-----------------------------|
| High emphasis   | `rgba(255, 255, 255, 0.87)`  | Primary body text, headings |
| Medium emphasis | `rgba(255, 255, 255, 0.60)`  | Secondary text, captions    |
| Disabled        | `rgba(255, 255, 255, 0.38)`  | Disabled text, placeholders |

## Status / Semantic Colors

| Status    | Hex       | Notes                                           |
|-----------|-----------|-------------------------------------------------|
| Success   | `#22D3EE` | Cyan (NOT green — avoids conflict with primary)  |
| Error     | `#CF6679` | M2 standard dark error                           |
| Warning   | `#FFB74D` | Amber/orange                                     |
| Today     | `#E8453C` | Bright red for current-date indicator             |

## Glow & Shadow System

```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.6);
--shadow-md: 0 4px 20px rgba(0, 0, 0, 0.7);
--shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.8);
--shadow-glow: 0 0 24px rgba(74, 222, 128, 0.10);
--shadow-glow-strong: 0 0 40px rgba(74, 222, 128, 0.16);
```

## CSS Variable Mapping (for `src/index.css`)

Maps the M2 palette above to Ink Bloop's existing `@theme` block:

```css
@theme {
  /* Surfaces — M2 elevation overlay system (unchanged) */
  --color-bg: #121212;
  --color-surface: #1E1E1E;
  --color-elevated: #272727;
  --color-input: #2C2C2C;
  --color-border: #333333;
  --color-border-s: #383838;

  /* Text — white at M2 opacity levels (unchanged) */
  --color-text-p: rgba(255, 255, 255, 0.87);
  --color-text-s: rgba(255, 255, 255, 0.60);
  --color-text-t: rgba(255, 255, 255, 0.38);

  /* Primary accent — Green Man brand green (200-tone) */
  --color-accent: #4ADE80;
  --color-accent-dim: #16A34A;
  --color-accent-glow: rgba(74, 222, 128, 0.08);

  /* Secondary accent — warm amber/gold */
  --color-secondary: #FBBF24;
  --color-secondary-dim: #D97706;

  /* Status colors */
  --color-danger: #CF6679;
  --color-success: #22D3EE;
  --color-today: #E8453C;

  /* Shadows — green-tinted glows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.6);
  --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.7);
  --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.8);
  --shadow-glow: 0 0 24px rgba(74, 222, 128, 0.10);
  --shadow-glow-strong: 0 0 40px rgba(74, 222, 128, 0.16);
}
```

## Contrast Verification (WCAG AA ≥ 4.5:1)

| Foreground   | Background        | Ratio  | Pass? |
|--------------|-------------------|--------|-------|
| `#4ADE80`    | `#121212` (0dp)   | ~9.2:1 | Yes   |
| `#4ADE80`    | `#383838` (24dp)  | ~6.8:1 | Yes   |
| `#FBBF24`    | `#121212` (0dp)   | ~10.5:1| Yes   |
| `#FBBF24`    | `#383838` (24dp)  | ~8.2:1 | Yes   |
| `#000000`    | `#4ADE80` (on-p)  | ~9.2:1 | Yes   |
| `#000000`    | `#FBBF24` (on-s)  | ~10.5:1| Yes   |
| `#CF6679`    | `#121212` (error) | ~5.5:1 | Yes   |
| White 87%    | `#121212` (text)  | ~14:1  | Yes   |
| White 60%    | `#121212` (text)  | ~8:1   | Yes   |

## Implementation Notes

1. **Success is cyan, not green**: Since the primary brand color is green, using green for success would be ambiguous. Cyan (`#22D3EE`) is visually distinct while still reading as "positive."

2. **Secondary (amber) vs warning (orange)**: `#FBBF24` and `#FFB74D` are close. If both appear near each other in UI, consider darkening warning to `#F57C00` or shifting secondary toward gold (`#EAB308`).

3. **Booking status colors**: Components with hardcoded status hex values (e.g. completed = `#81C784`, no-show = `#FFB74D`) should be updated to use the new variables or adjusted to avoid green-primary conflict.

4. **New variable**: `--color-secondary` and `--color-secondary-dim` are new additions not in the current theme. Components that need a secondary accent (e.g. FABs, selection indicators) can reference these.

## Design Rationale

- **Primary green `#4ADE80`**: Logo green (~`#4ADE40`) shifted to M2 200-tone — slightly lighter and cooler to prevent visual vibration on `#121212`. Still bold and recognizable as the Green Man brand.
- **Secondary amber `#FBBF24`**: Warm complement to cool green. Evokes tattoo-culture energy (gold, warmth, fire). Creates strong visual contrast for secondary actions.
- **Bold & edgy**: Achieved through higher-than-typical saturation on primary, green glow effects on elevated elements, and strong dark shadows. Pushes M2 guidelines toward maximum vibrancy while staying within contrast requirements.
