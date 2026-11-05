# Specentra AMS — UI Design System

A premium, enterprise-grade design language for the Specentra Audit Management
System. Scandinavian-minimalist, calm, and information-dense — in the class of
Linear, Stripe, and Notion — with a restrained **violet** brand.

This document is the reference for the token system and the reusable components
introduced during the in-place UI redesign. **Nothing here changes routes, the
API, or application state.** The redesign is purely presentational.

---

## 1. Principles

1. **Tokens first.** Every colour, radius, shadow, duration, and z-index is a CSS
   custom property. Components never hardcode hex. Re-skin the whole product by
   changing token *values* — token *names* are a stable contract.
2. **Light and dark are equal citizens.** Light tokens live in `:root`
   (`src/index.css`); dark overrides in `:root[data-theme="dark"]` (`src/theme.css`).
3. **Honest UI.** Screens show real data and real empty/loading/error states.
   No fabricated metrics, no placeholder client names. Synthetic demo data only.
4. **AI is clearly labelled.** AI-generated content uses a distinct indigo
   provenance language and is always framed as a *draft pending human approval* —
   visually separate from the violet brand and from human-approved (green) states.
5. **Calm motion.** Short, eased transitions (120–220 ms). Fully disabled under
   `prefers-reduced-motion`.
6. **Accessible by default.** Visible `:focus-visible` rings, semantic markup,
   `aria` labels on icon-only controls, and AA-minded contrast.

---

## 2. Token architecture

Three CSS layers, loaded in this order:

| Layer | File | Role |
| --- | --- | --- |
| Base tokens + base component styles | `src/index.css` | `:root` light tokens, element/base styles |
| Dark tokens + theme remap | `src/theme.css` | `:root[data-theme="dark"]` values + an unscoped layer re-mapping legacy components to tokens |
| Refinement layer | `src/ui.css` | Canonical component primitives; loaded **last** so it supersedes older rules |

Theme is applied by setting `document.documentElement.dataset.theme` and persisted
in `localStorage` under `sp-theme` (`useThemeStore` in `src/store/index.js`).

### 2.1 Typography

- `--font-sans`: **Inter** (with IBM Plex Sans / system fallbacks)
- `--font-mono`: **IBM Plex Mono** — used for codes, WP numbers, section codes,
  financial-year labels, and tabular figures.

### 2.2 Brand (violet)

```
--brand:#6D28D9   --brand-strong:#5B21B6   --brand-soft:#7C3AED
--brand-pale:rgba(109,40,217,.10)
```

Legacy aliases (`--brand-gold*`, `--brand-teal*`, `--purple`) are **remapped to the
violet family** for backwards compatibility — older components pick up the brand
automatically. Prefer `--brand` / `--brand-pale` in new code.

### 2.3 Neutral scale

A cool-slate ramp `--n-0 … --n-900` underpins surfaces, text, and borders.

### 2.4 Surfaces, text, borders

```
--bg-app --bg-sidebar --bg-card --bg-card-hover --bg-subtle --bg-input
--bg-table-head --bg-table-row --bg-table-alt
--text-primary --text-secondary --text-muted --text-inverse
--border --border-strong --border-focus --hairline
```

### 2.5 Semantic colours

Each has `fg` / `-bg` / `-border` variants plus intent aliases:

```
--green  (--success)   --amber (--warning)
--red    (--danger)    --blue  (--info)
```

### 2.6 AI vs approved

Deliberately distinct from the brand so "machine draft" never reads as "done":

```
AI draft (indigo):   --ai-fg:#4338CA  --ai-bg:#EEF0FE  --ai-border:#CFD3F6  --ai-marker:#6366F1
Human-approved:      --approved-fg (green)  --approved-bg  --approved-border
```

### 2.7 Radii, elevation, motion, z-index, metrics

```
Radii      --r-sm 5 · --r-md 8 · --r-lg 11 · --r-xl 14 · --r-2xl 18 · --r-full 999
Elevation  --shadow-xs/sm/md/lg/modal  (soft, hairline-first)
Motion     --dur-fast 120 · --dur-base 160 · --dur-slow 220
           --ease (standard) · --ease-out · --ease-in
Z-index    --z-sticky 20 · --z-header 30 · --z-dropdown 900 · --z-drawer/modal 1000
           --z-toast 1100 · --z-command 1200
Metrics    --sidebar-w 240 · --sidebar-rail-w 64 · --topbar-h 52
```

---

## 3. App shell

| Area | Component | Notes |
| --- | --- | --- |
| Sidebar | `components/layout/Sidebar.jsx` | Firm switcher, collapsible rail (240 → 64 px, persisted), grouped nav (Workspace / Administration), active-engagement block, user menu. Tooltips appear when collapsed. |
| Top bar | `components/layout/TopBar.jsx` | Route + engagement breadcrumbs, sidebar toggle, **⌘/Ctrl-K** command trigger, pending-reviews pill (honest placeholder), notifications. Height `--topbar-h`. |
| Command palette | `components/layout/CommandPalette.jsx` | Global **Ctrl/Cmd-K**. Grouped Navigate / Actions, arrow + enter keyboard nav, Esc to close. |
| Layout | `App.jsx` → `AppLayout` | `Sidebar` + `main-content` ( `TopBar` + scrollable `.main-scroll` ) + `CommandPalette`. Page roots use `height:100%` to fill the scroll area. |

UI shell state (`sidebarCollapsed`, `commandOpen`) lives in `useUIStore`
(`src/store/index.js`), with `sidebarCollapsed` persisted.

On mobile (`max-width:760px`) the sidebar becomes a fixed drawer with a backdrop.

---

## 4. Core primitives (`src/ui.css`)

- **Buttons** — `.btn` with `.btn-primary` (solid violet), `.btn-outline`,
  `.btn-ghost`, `.btn-soft`; sizes `.btn-sm` / `.btn-xs`; `.icon-btn` for
  icon-only actions. Loading via `[data-loading="true"]`.
- **Status pills** — `.pill` + `.pill-notstarted` / `-progress` / `-reviewed` /
  `-blocked` / `-approved`.
- **Badges** — `.badge` + semantic / `.badge-ai` / `.badge-approved`.
- **AI language** — `.ai-surface` (indigo panel with left marker), `.source-chip`
  (provenance chip), `.ai-flag`.
- **Avatars** — `.avatar`, `.avatar-group` (initials, overlap).
- **Feedback & states** — `.skeleton`, empty-state blocks, `.tip[data-tip]`
  tooltips (`.tip-right`), `.kbd` key hints.
- **Data** — `.data-table`, `.toolbar`, `.segmented` (view toggles),
  `.progress` / `.progress-stack` (single + segmented meters), `.breadcrumbs`.
- **Overlays** — `.menu` (dropdowns), `.scrim` / `.sheet` (drawers).

A living reference of every primitive is rendered at the dev route
**`/design-system`** (`pages/DesignSystemPage.jsx`).

---

## 5. Screen patterns

### Engagements (`pages/EngagementsPage.jsx`)
Fetch-all + client-side filter/sort toolbar (search, status, FY, type, sort) with
a **grid ↔ table** segmented toggle. Full skeleton / empty / error / no-results
states. Partner filter is intentionally omitted until the list API exposes partner
data (ready to wire later).

### Dashboard (`pages/DashboardPage.jsx`)
Honest: real engagement counts (`StatCard`), an *Engagements by phase* bar
breakdown, a *Recent engagements* list, an *Awaiting your review* slot (with an
all-caught-up state), an AI-insights placeholder (`.ai-surface`), and a firm
quality checklist. No fabricated figures.

### Engagement workspace (`pages/EngagementDetailPage.jsx`)
The most important screen.

- **Header** `.eng-head` — client name, FY (mono), status, engagement type, and
  flag badges (EQCR, small entity, workflow override, read-only). Destructive
  actions (reopen) confirm first.
- **Progress strip** `.eng-progress` — a segmented meter (green = finalised,
  amber = in-review) with finalised/total and an open-notes count. Shown only
  when the engagement has working papers.
- **Sticky tabs** `.eng-tabs-wrap` / `.eng-tab` with count badges (`.tab-count`),
  e.g. the working-paper count on *File Explorer*.
- **File Explorer tree** — three levels with indentation-based hierarchy:
  - `SectionBlock` — section code (mono), name, lock badge, a progress meter and
    finalised/total, and a hover *New folder* action.
  - `FolderNode` — chevron, violet folder icon, item count, and hover
    *Upload* / *New subfolder* actions. Honest empty-folder rows with an
    *Add working paper* affordance.
  - `WPRow` — file-type icon (by extension), WP number (mono), filename, open-note
    badge, sign-off avatars (`WpAvatars`), and a status pill (`WpPill`).
    Row selection via a hover checkbox drives the bulk-action bar.
- **Detail panel** `components/wps/WPDetailPanel.jsx` — WP preview / notes /
  versions / links / sign-off, opening beside the tree.
- **Activity log** — an icon-led timeline (no emoji), each entry mapped to an
  icon + colour + label, with actor and a formatted timestamp.

---

## 6. Agent-ready UI

The **Risk Assessment Agent** tab (`components/agents/RiskAssessmentPanel.jsx`)
demonstrates the agent pattern:

- **Pipeline / stepper** — a seven-stage flow (Engagement → Financials →
  Materiality → Thresholds → MCOTABD → Risk Engine → **Gate Review**) with
  per-step completion state.
- **AI provenance banner** — an `.ai-surface` strip with an *AI-assisted* badge
  making clear that every agent figure is a **draft for professional review** and
  nothing is recorded on the file until a Partner or Audit Manager approves it at
  **Gate Review**.
- **Honest config states** — explicit alerts when the knowledge base or LLM
  connection is unavailable.

The AI design language (`--ai-*`, `.badge-ai`, `.ai-surface`, `.source-chip`) is
reserved for machine output; human-approved content uses the green approved tokens.

---

## 7. Accessibility & motion

- `:focus-visible` rings on all interactive elements (`src/ui.css`, `src/theme.css`).
- Icon-only buttons carry `aria-label`; breadcrumbs use `nav[aria-label]`.
- `prefers-reduced-motion: reduce` disables animations, transitions, and smooth
  scroll (`src/theme.css`).
- Status is never conveyed by colour alone — pills and badges always carry text.

---

## 8. Conventions for contributors

- **Never hardcode a colour.** Use a token. If one is missing, add it to `:root`
  (and the dark block) rather than inlining hex.
- **Prefer `src/ui.css`** for new component styles; it loads last and wins.
- **Keep token names stable** — they are a contract across the app.
- **Page roots use `height:100%`** so they fill `.main-scroll` beneath the top bar.
- **Fonts via tokens** — `var(--font-sans)` / `var(--font-mono)`, never a literal
  family name.
- Validate every change with `npm run build` from `frontend-build/`.

---

## 9. Design decisions (redesign log)

- Switched the sans typeface to **Inter** (kept **IBM Plex Mono** for codes),
  centralised behind `--font-sans` / `--font-mono`.
- **Solid violet** primary button (with a dark-mode text fix).
- Rebranded the former gold/teal palette to **violet**; legacy aliases remapped
  so older components inherit the brand without edits. Remaining true teal hexes
  (focus ring, info strip) were replaced with brand tokens.
- Made the **Dashboard honest** — removed all fabricated metrics and names.
- **Pending-reviews and notifications** are honest placeholders (count 0) until
  wired to data.
- The large `EngagementDetailPage` was refactored toward token-based classes
  (`.eng-head`, `.eng-tabs`, `.tree-*`, `.activity-*`) in place of inline styles.

---

## 10. Account & Settings (information architecture)

Personal and firm-level concerns are two separate trees, so users always know
whether they are changing something about **themselves** or about **the firm**.

### 10.1 Sitemap

```
Account  /account/*        (ME — every user, no gating)
 ├─ /account/profile        identity, designation, ICAI MRN
 ├─ /account/sign-off       initials, DSC status, signature image
 ├─ /account/work           awaiting review / my engagements / recent activity (sample)
 ├─ /account/preferences    theme (Light/Dark/System), density, date/number format, landing
 ├─ /account/security       change password (real), 2FA, active sessions
 ├─ /account/notifications  event + channel toggles
 └─ /account/shortcuts      keyboard cheat-sheet

Settings /settings/*       (THE FIRM — Admin only; others get a No-access state)
 ├─ Firm        → /settings/firm · /roles · /templates · /retention
 ├─ Documents   → /settings/documents/editor (real) · /storage · /numbering
 ├─ AI & Agents → /settings/ai-agents (existing) · /settings/ai-status
 └─ Security    → /settings/security/sessions · /audit · /signoff
```

`/settings` redirects to `/settings/firm`; `/account` redirects to
`/account/profile`. Old `/settings` continues to resolve, so nothing 404s.

### 10.2 Routing & gating

- `App.jsx` uses a layout route `<Shell>` that renders the app chrome plus an
  `<Outlet/>`; `AccountLayout` and `SettingsLayout` are nested layout routes with
  their own left sub-navigation.
- `RequireAdmin` renders `<NoAccess/>` (a proper in-shell state) instead of a
  silent redirect, so a non-admin who types a `/settings/*` URL sees a clear
  "no access" message with navigation intact.

### 10.3 New components

| Component | File | Notes |
| --- | --- | --- |
| `UserMenu` | `components/layout/UserMenu.jsx` | Rich account popover: initials avatar, practice card (name, designation, role, email), firm + ICAI row, real "last sign-in / member since", grouped actions, inline appearance switch, Sign out. Focus-trapped, arrow-navigable, Esc to close. |
| `AppearanceSwitch` | `components/common/AppearanceSwitch.jsx` | Light / Dark / **System** segmented control bound to `useThemeStore.mode`. |
| `NoAccess` | `components/common/NoAccess.jsx` | Role-gated empty state with back / dashboard actions. |
| `SettingsShell` | `components/settings/SettingsShell.jsx` | Section header + status-note wrapper for lighter settings pages. |

### 10.4 Hub layout primitives

`.hub` / `.hub-nav` / `.hub-nav-item` / `.hub-main` provide the two-pane
workspace shared by Account and Settings. Section bodies use `.account-section`
/ `.settings-section` with `.section-head`, `.card-foot`, `.form-grid`,
`.pref-row`, `.toggle`, and `.muted-note`.

### 10.5 Document Editor settings

`pages/settings/DocumentEditorSettings.jsx` (moved out of the old mixed
`SettingsPage`):

- Provider **cards grouped** by Built-in / Free self-hosted / Paid / Other, with
  `.status-badge` states **Ready** (green), **Requires setup** (amber, when an
  infra provider has no URL) and **Planned** (muted). Planned providers
  (Microsoft 365) are **disabled and not selectable**. Provider values are
  unchanged from the API.
- An expandable **Connection** panel for ONLYOFFICE / Collabora with a server-URL
  field and a **Test connection** button that performs a real `no-cors`
  reachability probe, surfaced as a `.health-pill` (Checking / Reachable /
  Unreachable).
- A sticky **summary bar** showing current vs. selected provider with an
  `Unsaved` state, **Discard**, and **Save**. Switching provider opens a
  `.confirm-overlay` dialog ("this changes how all Word/Excel working papers
  open"); a success toast and an audit note ("Changed by X on date") follow.
- The existing `settingsApi.updateEditor` save behaviour is unchanged.

### 10.6 Preferences & theme modes

`useThemeStore` now carries a `mode` (`light` | `dark` | `system`) resolved to a
concrete `theme`, following the OS when set to system. `usePreferencesStore`
(device-local) holds density, date/number format, default landing and
notification toggles; density is applied via `document.documentElement.dataset.density`.
`useProfileStore` holds personal extras (designation, ICAI MRN, phone, DSC
flag) until a firm-profile backend exists — the UI labels these as
stored on-device.

> Synthetic-only rule still applies: "My work", sessions and some firm sections
> show clearly-labelled **sample data**; real figures arrive with their backends.

---

## 11. Resizable panels & custom scroll

All live in `components/common/Resizable.jsx`.

### 11.1 `useResizablePanel(options)`

Owns a panel's width: clamping, persistence, pointer-drag, keyboard, collapse-snap.
While dragging it writes the width to a **CSS variable** on a target element (no
React re-renders per frame, via `requestAnimationFrame` + pointer capture); it
commits to React state + `localStorage` only on release.

| Option | Purpose |
| --- | --- |
| `storageKey` | Namespaced `localStorage` key (see below) |
| `defaultWidth` / `minWidth` / `maxWidth` | Bounds; `defaultWidth` is the double-click/Enter reset target |
| `cssVar` / `targetRef` | The variable (e.g. `--sidebar-w`) and the element it's written to |
| `anchorRef` | Element whose left edge is the drag origin |
| `getMaxWidth()` | Dynamic clamp so the main content never drops below a usable width |
| `collapsible` / `collapseBelow` / `collapsed` / `onCollapsedChange` | Snap-to-rail integration (sidebar) |
| `disabled` | Turns resizing off (small screens) |

Returns `{ width, dragging, onPointerDown, onKeyDown, reset, min, max }`.

### 11.2 `<ResizeHandle>`

Presentational, keyboard-accessible separator. Slim 4px line that thickens and
shows a grip on hover/drag, accent-coloured while dragging, cursor `col-resize`.

- `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow/min/max`.
- **Keyboard:** ←/→ resize by 16px (Shift = 48px); Home/End jump to min/max;
  Enter or double-click resets. Touch via pointer events. Respects
  `prefers-reduced-motion`. Disabled (not rendered) on small screens.
- Positioned by a `className` that sets `left` (`resize-sidebar` → `var(--sidebar-w)`,
  `resize-hubnav` → `var(--hub-nav-w)`).

### 11.3 Where applied + persistence keys

| Panel | Default / min / max | Storage key | Collapse |
| --- | --- | --- | --- |
| Main sidebar | 280 / 220 / 420 | `specentra:panel:sidebar` | Snaps to the icon rail below 160px (drives `useUIStore.sidebarCollapsed`) |
| Account sub-nav | 260 / 200 / 400 | `specentra:panel:account-nav` | — |
| Settings sub-nav | 260 / 200 / 400 | `specentra:panel:settings-nav` | — |

The sidebar is clamped so the main content never drops below ~560px
(`getMaxWidth = innerWidth − 560`); hub sub-navs keep their content pane ≥ 360px.
Writes are `try/catch` guarded. Resizing is disabled under 760px (sidebar) / 860px
(hubs), where the existing responsive behaviour takes over.

### 11.4 `<ScrollArea>` + `useScrollFades(ref)`

A scroll container with a **thin, themed, auto-hiding** scrollbar (tokens
`--scrollbar-thumb` / `--scrollbar-thumb-hover`), `scrollbar-gutter: stable`,
`overscroll-behavior: contain`, and **top/bottom scroll-shadow fades**
(`--scroll-shadow`, drawn as inset shadows toggled by `data-top`/`data-bottom`).
`useScrollFades` also adds `.is-scrolling` so the scrollbar appears on scroll and
fades when idle.

Applied to: the sidebar nav list (footer stays pinned), the Account/Settings
sub-navs, the Account/Settings main content, the file-explorer tree, and the user
popover.

### 11.5 User popover (floating layer)

`UserMenu` renders the popover through a **portal to `document.body`** with
`position: fixed`, a fixed 320px width (independent of the sidebar width), and
`max-height` with internal scroll. Placement is collision-aware: it opens upward
from the user block and, in the collapsed rail, flips to the side with viewport
clamping; it re-places on scroll/resize. Long values truncate with a tooltip; the
"Add ICAI membership number" prompt is a tidy inline action.


