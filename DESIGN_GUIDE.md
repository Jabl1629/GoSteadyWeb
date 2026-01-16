# Go Steady Design Guide

A visual design system for maintaining consistency across web and mobile platforms.

---

## Brand Colors

### Primary Palette
| Name | Hex | Usage |
|------|-----|-------|
| **Sage** | `#4A7C59` | Primary brand color, buttons, links, accents |
| **Sage Light** | `#5D9A6F` | Hover states, gradients |
| **Sage Dark** | `#3A6147` | Pressed states, dark accents |
| **Accent Green** | `#50C878` | Success states, indicator rings, checkmarks |

### Neutral Palette
| Name | Hex | Usage |
|------|-----|-------|
| **Warm White** | `#FFFCF7` | Primary background |
| **Cream** | `#F9F6F0` | Secondary background, cards |
| **Border** | `#E5E0D8` | Borders, dividers |
| **Text Primary** | `#2D3A2E` | Headlines, primary text |
| **Text Soft** | `#5A6B5C` | Body text, descriptions |

### Semantic Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Success** | `#50C878` | Positive states, confirmations |
| **Warning/Alert** | `#C85050` | Low activity, alerts (use sparingly) |

---

## Typography

### Font Families
- **Headlines:** `Fraunces` (Google Fonts) — Elegant serif with soft optical sizing
- **Body:** `Inter` (Google Fonts) — Clean, readable sans-serif

### Font Weights
- Fraunces: 300, 400, 500, 600
- Inter: 400, 500, 600

### Type Scale

| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| H1 (Hero) | Fraunces | 48-64px (clamp) | 400 | 1.15 |
| H2 (Section) | Fraunces | 32-48px (clamp) | 400 | 1.2 |
| H3 (Card title) | Fraunces | 20px | 500 | 1.3 |
| Subheading | Inter | 21px | 500 | 1.5 |
| Body | Inter | 17-18px | 400 | 1.7 |
| Small/Caption | Inter | 14-15px | 400 | 1.6 |
| Button | Inter | 16px | 500-600 | 1 |
| Label | Inter | 14px | 500 | 1 |

### Special Typography
- **Italics:** Used for emphasis in headlines (e.g., "Peace of Mind, *Delivered*")
- **Labels/Badges:** Uppercase, letter-spacing: 0.1em, font-weight: 600

---

## Spacing System

Base unit: **4px**

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight spacing, icon gaps |
| sm | 8px | Inline elements |
| md | 16px | Component padding |
| lg | 24px | Section gaps |
| xl | 32px | Major section padding |
| 2xl | 48px | Large gaps |
| 3xl | 64px | Section vertical padding |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| sm | 12px | Inputs, small buttons |
| md | 16px | Feature icons |
| lg | 20px | Cards |
| xl | 24px | Large cards, images |
| 2xl | 32px | Phone mockups |
| full | 100px / 50% | Pill buttons, avatars |

---

## Shadows

```css
/* Card shadow */
box-shadow: 0 20px 50px rgba(45, 58, 46, 0.08);

/* Elevated card (hover) */
box-shadow: 0 20px 50px rgba(45, 58, 46, 0.12);

/* Image shadow */
box-shadow: 0 40px 80px rgba(45, 58, 46, 0.12);

/* Button shadow (hover) */
box-shadow: 0 10px 30px rgba(74, 124, 89, 0.3);

/* Phone mockup shadow */
box-shadow: 0 30px 60px rgba(45, 58, 46, 0.2);
```

---

## Components

### Buttons

**Primary Button**
- Background: `#4A7C59` (Sage)
- Text: White
- Padding: 16px 32px
- Border-radius: 100px (pill)
- Hover: `#3A6147` (Sage Dark), translateY(-2px), shadow

**Secondary/Ghost Button**
- Background: Transparent
- Border: 1px solid `#4A7C59`
- Text: `#4A7C59`

### Cards

- Background: White (`#FFFFFF`)
- Border: 1px solid `#E5E0D8`
- Border-radius: 20px
- Padding: 32px
- Hover: translateY(-5px), increased shadow, border color change to Sage Light

### Feature Icons

- Size: 56px × 56px
- Background: Linear gradient 135deg from Sage to Sage Light
- Border-radius: 16px
- Icon color: White
- Icon size: 28px

### Form Inputs

- Background: `#F9F6F0` (Cream)
- Border: 1px solid `#E5E0D8`
- Border-radius: 12px
- Padding: 16px 20px
- Focus: Border `#4A7C59`, box-shadow with 4px spread

### Checkmarks/List Items

- Icon: Checkmark in `#50C878` (Accent Green)
- Text: `#2D3A2E` (Text Primary)
- Gap: 16px between icon and text

---

## Iconography

- **Style:** Feather Icons / Lucide (outline style)
- **Stroke width:** 2px (standard), 2.5px (emphasis)
- **Sizes:** 16px (inline), 20px (list items), 24px (nav), 28px (feature icons)

### Key Icons Used
- Battery (feature)
- Signal/Cellular bars (feature)
- Clock (feature)
- Package/Box (feature)
- Check (list items, success)
- Arrow right (buttons)
- Lock (security)
- Shield (trust)

---

## Motion & Animation

### Transitions
- **Default:** 0.3s ease
- **Hover lifts:** translateY(-2px to -5px)

### Page Load Animation
```css
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Duration: 1s, ease-out */
```

### Pulse Animation (for status indicators)
```css
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}
/* Duration: 3s, ease-in-out, infinite */
```

---

## Layout Patterns

### Max Widths
- Content: 1200px
- Narrow content: 1000px
- Form: 600px

### Grid
- Feature cards: 4-column on desktop, 2-column tablet, 1-column mobile
- Showcase sections: 2-column with image/content split

### Responsive Breakpoints
- Desktop: > 1024px
- Tablet: 768px - 1024px
- Mobile: < 768px

---

## App-Specific Guidelines (Dashboard/Flutter)

### Navigation
- Use bottom navigation for mobile app
- Primary actions in Sage color
- Active state: Filled icon + Sage color
- Inactive state: Outline icon + Text Soft color

### Charts & Data Visualization
- Bar charts: Sage green for normal, `#C85050` for alerts/low activity
- Use rounded corners on bars (border-radius: 4-8px)
- Grid lines: `#E5E0D8` at 0.5px
- Labels: Text Soft color, 12-14px

### Cards in App
- Weekly summary cards
- Alert cards (with left border accent in warning color)
- Activity detail cards

### Status Indicators
- Green ring: Active/Connected (`#50C878`)
- Gray: Inactive
- Red/Orange: Alert state

---

## Logo Usage

- **Primary:** Logo + "Go Steady" wordmark
- **Icon only:** For small spaces, app icons
- **Clear space:** Minimum padding equal to logo height
- **Minimum size:** 24px height

---

## Voice & Tone

- **Warm and reassuring** — We're helping families
- **Simple and clear** — No medical jargon
- **Respectful of independence** — "Peace of mind" not "monitoring"
- **Action-oriented** — Clear CTAs

### Key Phrases
- "Peace of mind, delivered"
- "Check in without checking up"
- "Stay connected"
- "Discreet safety companion"

---

## Quick Reference (CSS Variables)

```css
:root {
  /* Colors */
  --color-sage: #4A7C59;
  --color-sage-light: #5D9A6F;
  --color-sage-dark: #3A6147;
  --color-cream: #F9F6F0;
  --color-warm-white: #FFFCF7;
  --color-text: #2D3A2E;
  --color-text-soft: #5A6B5C;
  --color-accent: #50C878;
  --color-border: #E5E0D8;
  
  /* Typography */
  --font-serif: 'Fraunces', Georgia, serif;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

---

## Flutter/Dart Color Reference

```dart
class GoSteadyColors {
  static const Color sage = Color(0xFF4A7C59);
  static const Color sageLight = Color(0xFF5D9A6F);
  static const Color sageDark = Color(0xFF3A6147);
  static const Color accent = Color(0xFF50C878);
  static const Color warmWhite = Color(0xFFFFFCF7);
  static const Color cream = Color(0xFFF9F6F0);
  static const Color textPrimary = Color(0xFF2D3A2E);
  static const Color textSoft = Color(0xFF5A6B5C);
  static const Color border = Color(0xFFE5E0D8);
  static const Color alert = Color(0xFFC85050);
}
```

---

*Last updated: January 2026*
