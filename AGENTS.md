# ALFREDO project guidance

## Brand and UI

- Follow `docs/brand/brand-guidelines.md` and `docs/brand/UI_PATTERNS.md` for all storefront UI work.
- Treat `frontend/src/styles/design-tokens.css` as the source of truth for colors, spacing, typography, radii, shadows, breakpoints, motion, and focus states.
- Reuse existing React components and shared UI patterns; do not introduce repeated one-off styling values.
- Preserve the approved ALFREDO homepage order and exact copy: Header, Hero, then Choose Your Arena; preserve the required headlines and CTA.
- Keep the identity royal-white, burgundy, technical-black, and deep-green. Do not use third-party team, kit-maker, sponsor, or club marks.
- Keep interactive states keyboard accessible, respect reduced motion, and use semantic status colors.

## Engineering

- Preserve existing ecommerce, cart, authentication, and route behavior when changing presentation.
- Do not alter payment, order, authentication, or business logic as part of design-system work.
- Use the existing frontend scripts for tests, lint, and production builds.
