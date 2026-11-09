# ALFREDO Brand Guidelines

## Brand platform

**Positioning:** Premium Sports-Tech — competitive energy and thoughtful engineering in one modern retail experience.

**Tagline:** WHERE LEGENDS MEET TECHNOLOGY.

**Personality:** confident, precise, energetic, premium, and trustworthy. ALFREDO is a product destination, not a football news or fan site.

## Visual identity

The identity takes its visual cues from royal white, restrained burgundy, technical black, and deep green. These are broad color references only; ALFREDO uses its own wordmark and original artwork. Do not reproduce or imply affiliation with club, league, kit-maker, or sponsor marks.

| Role | Token | Value | Use |
|---|---|---:|---|
| Cool royal white | `--color-page` | `#F4F7F9` | Main canvas |
| Pure white | `--color-surface` | `#FFFFFF` | Cards, forms, navigation |
| Cool mist | `--color-surface-muted` | `#EDF2F5` | Image wells, secondary surfaces |
| Burgundy | `--color-brand` | `#74243D` | Primary actions, active states, dividers |
| Deep burgundy | `--color-brand-strong` | `#5D1C31` | Hover/pressed states |
| Technical black | `--color-text` | `#191A1D` | Primary text |
| Deep green | `--color-secondary` | `#174538` | Secondary accents and details |
| Muted text | `--color-muted` | `#5D6970` | Supporting copy |
| Border | `--color-border` | `#DCE4E9` | Quiet separation |

Semantic success, warning, error, and information colors are separately tokenized. Do not use the semantic palette as decoration.

## Logo

Use the original ALFREDO monogram and wordmark in `frontend/src/assets/brand/logo.svg`. Keep its proportions; do not recolor the wordmark arbitrarily, add effects, or pair it with third-party marks. Use the SVG on light surfaces and provide sufficient clear space equal to the monogram's cap height.

## Typography

- **Display and headings:** Manrope, with a system sans-serif fallback.
- **Body and controls:** DM Sans, with a system sans-serif fallback.
- Use the centralized scale and weights in `frontend/src/styles/typography.css`.
- Headlines use tight leading and measured line lengths. Body copy should remain readable and calm.
- Use tabular numerals for prices, quantities, and status values.

## Layout and imagery

- Preserve a predominantly light royal-white canvas. Dark surfaces are reserved for product photography, small technical accents, and intentional contrast.
- Use a centered, responsive content container and the spacing/radius/shadow/breakpoint tokens.
- Product imagery should be large, cleanly cropped, and visually dominant. Use original ALFREDO artwork or authorized product photography; do not add unlicensed club/team branding.
- Avoid decorative clutter, excessive gradients, neon glow, and generic promotional collage imagery.

## Homepage lock

The homepage's first three major areas must remain in this order:

1. White header with logo, SHOP / GAMING / TECH navigation, cart, and a burgundy divider.
2. Warm royal-white hero with “THE NEXT GENERATION,” “PLAY LIKE A LEGEND.”, “LIVE THE TECHNOLOGY.”, supporting copy, “EXPLORE COLLECTION,” and a large original gaming/electronics visual.
3. “CHOOSE YOUR ARENA.” with prominent GAMING and TECHNOLOGY image cards.

Do not change the required headline or CTA, replace the hero composition, or insert another major section before the arena cards.

## Accessibility and interaction

- Meet WCAG AA contrast for normal text and interactive controls.
- Every interactive element has visible keyboard focus, a clear accessible name, and a minimum 44px touch target where practical.
- Convey disabled, loading, active, success, and error states with more than color alone.
- Respect reduced-motion preferences. Motion is brief and functional.
- Maintain responsive layouts from mobile through wide desktop.

## Do

- Use design tokens rather than repeated raw values.
- Keep actions direct, labels concise, and product details easy to scan.
- Reuse shared UI components and their documented variants.
- Keep existing commerce, cart, authentication, and route behavior intact.

## Do not

- Use Real Madrid, Adidas, Emirates, or other protected marks without authorization.
- Make every section dark or turn the store into a football fan destination.
- Add ad hoc colors, typography, or interaction treatments that conflict with this system.
