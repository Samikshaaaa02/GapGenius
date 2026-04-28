
# AI Hotel Revenue Copilot — Dashboard

A high-fidelity dark-mode executive dashboard demonstrating how AI surfaces and recovers revenue lost to fragmented hotel availability.

## 1. Design system & shell
- Dark professional theme: deep slate base (`#0B1120`-ish), card surfaces in slate-900/800, with semantic accents:
  - **Amber** → fragmented / alert
  - **Emerald** → available / recovered
  - **Slate** → booked / occupied
  - **Sky** → AI / brand accent
- Update `src/styles.css` design tokens to dark-first, register `--amber`, `--emerald`, `--slate-occupied`, `--ai-accent`.
- Inter / system font stack, tabular numerals for counters.
- App layout: persistent left sidebar + top header + main canvas.

## 2. Routing & views
Two views via sidebar toggle (TanStack Router routes, not just state, so each is shareable):
- `/` → **Property Manager View** (heatmap + AI panel + optimizer)
- `/portfolio` → **Portfolio Admin View** (multi-property comparison table)
- `/settings` → **Product Readiness** (toggles + PMS connection)

Sidebar shows: brand mark "Revenue Copilot", nav items (Property, Portfolio, Settings), collapsed PMS status pill at bottom.

## 3. Header
- Title: "Recoverable Revenue — April 2026"
- Large animated counter using `react-countup` (new dependency), starts at `$0`, animates to `$7,780` when **Run AI Optimization** is clicked.
- Sub-stat row: Orphan Nights count, Avg Min-Stay, Shoulder-Date occupancy %.
- Primary CTA button: **Run AI Optimization** (sky gradient, lightning icon).

## 4. Fragmentation Heatmap (core)
- 30 rooms × 30 days grid, horizontally + vertically scrollable, sticky row labels (Room 101…) and sticky date header (with weekday + shoulder-date highlight).
- Cell legend bar above grid: Booked / Available / Fragmented (Orphan Night).
- Cell sizes ~28px; subtle border; hover lifts + tooltip with room/date/rate.
- Mock dataset: JSON of 900 room-nights generated deterministically (seeded) — ~55% booked, ~30% available, ~15% fragmented, each fragmented cell carrying a `lostRevenue`, `signals[3]`, and `suggestedAction` (`lower_min_stay` | `shuffle_guest` | `open_shoulder`).
- Total fragmented loss tuned to **$18,400** monthly leakage (matches brief); optimizer recovers **$7,780** subset (the "safe fixes").

## 5. AI Reasoning side panel
- Slide-in right panel (Sheet) when an Amber cell is clicked.
- Header: Room # • Date • "Orphan Night detected"
- **Revenue Impact** block: e.g., `$340 lost` in amber.
- **3 Signals** list with icons:
  1. Rejected inquiries (e.g., "4 inquiries declined — min-stay 3 blocked 1-night requests")
  2. Competitor rates (e.g., "Comp set avg $289 vs your $245")
  3. Historical data (e.g., "Tuesday shoulder dates fill 87% when min-stay = 1")
- **1-click fix** primary button — label depends on action type ("Lower min-stay to 1", "Shuffle guest to Room 214", "Open shoulder date").
- Secondary "Dismiss" + "Explain more" links.
- Applying a fix flips that cell to Emerald with a small toast.

## 6. "Gasp moment" optimization
- Clicking **Run AI Optimization**:
  - Counter animates `$0 → $7,780` over ~2.2s.
  - All "safe-fix" Amber cells flip to Emerald with a 50ms stagger (scale + color transition), giving a wave effect across the grid.
  - Remaining (non-safe) Amber cells stay amber with a subtle pulse, indicating "Needs review".
  - Bottom toast: "Recovered $7,780 across 23 orphan nights."
- A **Reset** button restores original state for re-demo.

## 7. Portfolio Admin View
- KPI strip: Total Recoverable, Properties Connected, Avg Recovery %.
- Comparison table: **Downtown / Airport / Beachfront**, columns: Rooms, Orphan Nights, Monthly Leakage, AI-Recovered, Recovery %, Trend (mini sparkline via Recharts), Status badge.
- Row click → would deep-link to that property (stubbed to current view).

## 8. Settings / Product Readiness
- Toggle switches (shadcn Switch):
  - **Auto-apply safe fixes** (default on)
  - **Notify GM on high-impact fixes**
  - **Respect rate parity rules**
- Connection cards:
  - **Opera PMS** — Emerald "Connected" badge + last sync time
  - **SiteMinder Channel Manager** — Connected
  - **Revenue Management System** — "Available"
- Threshold sliders: min revenue impact to auto-fix, max min-stay reduction.

## 9. Mock data & state
- `src/data/mockInventory.ts` — seeded generator producing 900 room-nights with industry-correct fields (`roomId`, `date`, `status`, `rate`, `minStay`, `isShoulderDate`, `lostRevenue`, `signals`, `suggestedAction`, `safeFix`).
- `src/data/properties.ts` — 3 properties with aggregated stats.
- Lightweight Zustand-free state via React context (`InventoryProvider`) holding inventory + `applyFix(cellId)` + `runOptimization()` + `reset()`.

## 10. Files to add/modify
- Add: `src/routes/portfolio.tsx`, `src/routes/settings.tsx`
- Replace placeholder `src/routes/index.tsx`
- Add components: `AppSidebar`, `RevenueHeader`, `Heatmap`, `HeatmapCell`, `AIReasoningPanel`, `LegendBar`, `PropertyTable`, `ConnectionCard`, `OptimizerButton`
- Add: `react-countup` dependency
- Update `src/styles.css` tokens; update `__root.tsx` meta + per-route head metadata
- All routes share layout via `__root.tsx` rendering sidebar + outlet

## Out of scope (for this build)
- Real PMS integration, auth, persistence (in-memory only — refresh resets demo)
- Mobile-optimized heatmap (desktop-first; grid scrolls on small screens)
