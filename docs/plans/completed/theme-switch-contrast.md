# Theme Variant Switching

Status: implementation and automated validation complete.

Custom themes previously compared normalized uppercase hex values with lowercase
preset values and copied whole nested objects when any field differed. Switching
variants could therefore retain the old backgrounds, text or terminal palette.

- Compare hex colors without case sensitivity and transfer custom values per leaf.
- Preserve custom fonts, individual semantic colors, terminal colors and overrides.
- Repair the legacy configuration where all six UI surfaces match the opposite
  base variant while ink matches the current variant. Other custom palettes and
  configurations with explicit overrides remain unchanged.
- Apply the repair on preference initialization, saved-theme loading and rendering.
- Keep variant conversion in `app/theme-variant.ts`; retain the existing exports
  from `app/theme-config.ts` for callers.

Validation:

- Typecheck, ESLint, Prettier and CSS contract passed.
- All 194 renderer tests passed, including five new variant regression tests.
- Chrome fixture using production styles and theme code passed 40 foreground and
  background contrast checks across repeated TermHub/Codex dark/light switches.
- Existing browser terminal theme test passed, covering RGB/ANSI, CJK, live theme
  changes, normal/alternate screens and history.
- No native desktop interaction test was available. Browser fixtures do not
  establish native window behavior or macOS/Linux compatibility.
