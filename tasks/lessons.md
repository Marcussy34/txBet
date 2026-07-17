# Lessons

## 2026-07-17 — Pitch deck missed the app's design system (user: "everything is so badly made")

**Mistake:** Built a pptx deck with an invented palette (navy dark + green brand
accent, Courier New/Arial) instead of extracting txBet's real design system.
Also shipped without ever rendering/looking at the slides.

**Rules for next time:**

1. For ANY visual deliverable tied to a product, extract the product's real
   design tokens first: `src/app/globals.css` (oklch tokens), `layout.tsx`
   (next/font families), and screenshot the running app for motifs.
2. txBet theme = "Carbon Zero": monochrome carbon (#060606 bg, #F8F8F8 ink,
   #A4A4A4 muted, hairlines #2A2A2A/#383838); color is SEMANTIC ONLY
   (success #63D18F, warning #E5AC4C, danger #FF6E74). Fonts: Instrument Serif
   (display, two-tone headlines white/muted), Inter (body/wordmark),
   JetBrains Mono (data + uppercase tracked micro-labels). Ledger rows with
   hairline borders, measurement-rail motifs, short punchy serif statements
   ("Speed finds it. / Rules decide it.").
3. Never ship a visual artifact without rendering and LOOKING at it.
   PowerPoint AppleScript export is unreliable (Parameter error -50, sandbox
   silently eats outputs); use LibreOffice headless `soffice --convert-to pdf`
   + PyMuPDF rasterization for QA instead.
4. App fonts (Inter, JetBrains Mono, Instrument Serif) are now installed in
   `~/Library/Fonts` on this Mac; decks must reference those exact names.
