# ALFREDO UI Patterns

This guide describes the shared components in `frontend/src/components` and the design tokens in `frontend/src/styles`. Prefer these patterns over page-specific styling.

## Actions

Use `Button` from `components/ui` for button actions and `ActionLink` for navigation that should read as an action. Variants:

- `primary`: burgundy fill for the main action.
- `secondary`: deep-green or warm-gray secondary action.
- `outline`: white surface with a visible border.
- `ghost`: low-emphasis action.
- `danger`: destructive action with semantic error color.

Buttons retain a visible focus ring, pressed/hover feedback, disabled styling, and a minimum 44px height for prominent touch actions. Use links for navigation, styled with the same button tokens when they are visually actions.

## Forms

Use `Input` and `Select` from `components/ui` where possible. Labels remain visible and programmatically associated. Errors use `role="alert"` and semantic error tokens; help text should be adjacent to the relevant field. Do not rely on placeholder text as a label.

## Product cards

`ProductCard` owns product image, category, name, rating, price, add-to-cart, and wishlist presentation. Keep product photography contained on a quiet neutral image well. The add action must remain independent from the product-detail link and announce its outcome. Do not use hover as the only way to expose an action.

## Category cards

Homepage arena cards use a shared image-led proportion, a readable contrast overlay, uppercase category label, and clear destination. On narrow screens they stack without cropping the category label or shrinking the touch target.

## Badges and labels

Use `Badge` variants: `neutral`, `accent`, `success`, `warning`, and `danger`. Badges communicate stock, discount, or status; keep labels short and pair status color with text.

## Navigation and header

The shared `Header` is white, responsive, and keyboard operable. Desktop navigation exposes SHOP, GAMING, and TECH. The burgundy divider marks the navigation boundary. Mobile navigation uses an explicit menu button with `aria-expanded` and a dismissible panel. Cart count is announced in its link's accessible name.

## Footer

`Footer` uses a light warm-gray surface with the original ALFREDO logo, tagline, grouped links, and contact information. Maintain readable text contrast and clear focus indicators.

## Loading, empty, and error states

Use `LoadingState`, `EmptyState`, and `Alert` for shared feedback. Loading states expose `role="status"`; errors use `role="alert"` and include recovery guidance when possible. Keep the same page structure while data is loading or unavailable.

## Responsive behavior

- Start with a single-column mobile layout; expand grids and navigation at the centralized breakpoints.
- Keep primary actions visible and reachable without hover.
- Let card imagery crop responsively while preserving its subject.
- Check layout at 360px, 768px, and 1440px widths.

## Motion

Use the shared motion durations and easing. Keep transitions short; disable non-essential movement when `prefers-reduced-motion: reduce` is active.
