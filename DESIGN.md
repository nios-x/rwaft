---
name: rwaft
description: Describe an app in plain words; rwaft writes, builds and hosts it while you watch the real build beside a live preview.
colors:
  bg: "#fafafa"
  surface: "#ffffff"
  surface-2: "#f4f4f5"
  surface-3: "#e8e8eb"
  line: "#e6e6e9"
  line-strong: "#d4d4d8"
  text: "#0a0a0b"
  text-2: "#52525b"
  text-3: "#71717a"
  ink: "#0a0a0b"
  on-ink: "#ffffff"
  accent: "#6d4aff"
  accent-soft: "#f1edff"
  accent-ink: "#5534e0"
  line-c: "#be185d"
  line-soft: "#fdf0f6"
  build-c: "#f97316"
  build-soft: "#fff3e8"
  build-ink: "#b45309"
  live-c: "#16a34a"
  live-soft: "#ebf8ef"
  live-ink: "#15803d"
  fail-c: "#dc2626"
  fail-soft: "#fdeeee"
  fail-ink: "#b91c1c"
  bg-dark: "#030305"
  surface-dark: "#131316"
  surface-2-dark: "#1b1b1f"
  surface-3-dark: "#26262b"
  line-dark: "#24242a"
  line-strong-dark: "#34343b"
  text-dark: "#fafafa"
  text-2-dark: "#a8a8b2"
  text-3-dark: "#8b8b95"
  ink-dark: "#fafafa"
  on-ink-dark: "#0a0a0b"
  accent-dark: "#8b72ff"
  accent-soft-dark: "rgba(139, 114, 255, 0.14)"
  accent-ink-dark: "#b9a9ff"
  line-c-dark: "#f472b6"
  line-soft-dark: "rgba(244, 114, 182, 0.13)"
  build-soft-dark: "rgba(249, 115, 22, 0.14)"
  build-ink-dark: "#fdba74"
  live-c-dark: "#22c55e"
  live-soft-dark: "rgba(34, 197, 94, 0.13)"
  live-ink-dark: "#86efac"
  fail-c-dark: "#ef4444"
  fail-soft-dark: "rgba(239, 68, 68, 0.14)"
  fail-ink-dark: "#fca5a5"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  numeral:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "72px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  title-sm:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1.35
  body-lg:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
  label-sm:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
  status:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  tab: "8px"
  control: "10px"
  field: "11px"
  card: "14px"
  bubble: "16px"
  prompt: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-send:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.pill}"
    size: "34px"
  button-text:
    textColor: "{colors.text-2}"
    padding: "0"
  button-icon:
    textColor: "{colors.text-2}"
    rounded: "{rounded.control}"
    size: "34px"
  button-icon-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.pill}"
    padding: "0 11px"
    height: "30px"
  chip-example:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
  status-line:
    backgroundColor: "{colors.line-soft}"
    textColor: "{colors.line-c}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "22px"
  status-building:
    backgroundColor: "{colors.build-soft}"
    textColor: "{colors.build-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "22px"
  status-live:
    backgroundColor: "{colors.live-soft}"
    textColor: "{colors.live-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "22px"
  status-failed:
    backgroundColor: "{colors.fail-soft}"
    textColor: "{colors.fail-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "22px"
  prompt-box:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.prompt}"
    padding: "14px 14px 10px"
  prompt-box-compact:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.bubble}"
    padding: "8px 10px"
  segmented:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.pill}"
    height: "28px"
  tabs:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.field}"
    padding: "3px"
  tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.tab}"
    padding: "0 12px"
    height: "28px"
  address-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.field}"
    padding: "0 12px"
    height: "36px"
  card-project:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  msg-you:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.bubble}"
    padding: "10px 14px"
  menu:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "6px"
  header:
    padding: "0 16px"
    height: "56px"
---

# Design System: rwaft

## Overview

**Creative North Star: "The Frosted Workbench"**

rwaft is a plain, quiet workbench laid over a slow field of light. The pattern is the one the user pinned: Lovable/Bolt, kept simple. Home is one question ("What should we build?"), one large prompt box, a row of example chips and the maker's recent builds. The build screen is a chat column on the left and a preview panel on the right. Nothing sits on screen that isn't the build. The surfaces are white (or near-black) with 1px hairlines. There is one black action and one violet accent, and four status colours carry the whole state model. Type is Geist throughout.

The only atmosphere is the backdrop: a full-bleed WebGL simplex-noise "fluid field". It draws blue-to-violet beams on #030305 in dark mode and pale lavender washes on white in light mode, with an 8% overlay of grain and a fine 45° line texture on top. On Home it shows through openly. Behind the workspace it is frosted: the workspace and the build header are tinted with `color-mix` of the canvas and blurred, so the field reads only as a faint glow and chat text stays legible. This is the system's one indulgence, and everything above it stays flat and quiet so it can be afforded.

PRODUCT.md's principle 4 ("Density over emptiness") predates the user's explicit later request for a simple Lovable/Bolt-style UI, and that pinned request is the current direction. The two meet like this: Home is deliberately sparse, and the density lives in the workspace, which shows the real state: the plain-words step replies, the raw log lines inside each one, the position in line, the stage list, elapsed time, cost and balance. Light and dark are both first-class. The theme lives on `<html data-theme>`, is set before first paint, and dark mode redefines tokens only, never rules.

**Key Characteristics:**
- Near-white `#fafafa` / near-black `#030305` canvas, white or `#131316` surfaces, 1px hairlines.
- One black (ink) primary action per view; every secondary action is an underlined text button.
- One violet accent, used for links, focus, caret, selection and identity touches only.
- Four status colours (line, building, live, failed), always shown in the same dot-plus-label pill.
- Geist for everything, with Geist Mono only for raw build output.
- The fluid-field backdrop shows on Home and is frosted behind the workspace.
- Pills and softly rounded rectangles. Shadows only on the prompt box and floating layers.

## Colors

The palette is restrained: zinc neutrals, a single violet accent, and a four-colour status set in which each state gets a solid colour, a soft tint and a readable ink.

### Primary
- **Ink Black** (`ink`, #0a0a0b; flips to #fafafa in dark): the one primary action. It fills the primary pill button, the send button, the selected Preview/Log tab, the done-step dots and the logo tile. It is the darkest mark in any view, so wherever it appears is where the eye goes.

### Secondary
- **Build Violet** (`accent`, #6d4aff; #8b72ff in dark): the focus ring (2px outline, 2px offset), the prompt box's focus border, the text caret and the logo's live-endpoint dot.
- **Violet Ink** (`accent-ink`, #5534e0; #b9a9ff in dark): link text (the live URL in chat) and the initial letter on avatars and the shop icon.
- **Violet Mist** (`accent-soft`, #f1edff; 14% violet in dark): text selection, the 4px focus halo around the prompt box, and the avatar and shop-icon discs.

### Tertiary (status)
Every state has three roles. The solid colour (`-c`) is for dots. The soft tint (`-soft`) is the pill background. The ink (`-ink`) is pill text and any toned prose.
- **Queue Magenta** (`line-c` #be185d / `line-soft` #fdf0f6): in line. Note that `line-c` is the queue colour, while plain `line` is the hairline neutral; the two are unrelated.
- **Build Orange** (`build-c` #f97316 / `build-soft` #fff3e8 / `build-ink` #b45309): building. It also marks warnings, i.e. repair-attempt replies and warn-level log lines, and the pulsing dot in the shared-line chip.
- **Live Green** (`live-c` #16a34a / `live-soft` #ebf8ef / `live-ink` #15803d): live. It also colours good-news replies ("Your site is live.", refunds), success log lines and the checkout success banner.
- **Fail Red** (`fail-c` #dc2626 / `fail-soft` #fdeeee / `fail-ink` #b91c1c): failed. It also colours error log lines, field and prompt errors, and the failed-state icon disc.

### Neutral
- **Canvas** (`bg`, #fafafa / #030305): the page, and the base that the frosted layers are mixed from.
- **Surface** (`surface`, #ffffff / #131316): the prompt box, cards, chips, tabs, address bar, panel body, menus and shop.
- **Sunken** (`surface-2`, #f4f4f5 / #1b1b1f): the mode-switch track, your own chat bubble, raw-log blocks, hover fills and the preview panel's tinted backing.
- **Deep** (`surface-3`, #e8e8eb / #26262b): tab counters, spinner track and scrollbar thumb.
- **Hairline** (`line`, #e6e6e9 / #24242a) and **Hairline Strong** (`line-strong`, #d4d4d8 / #34343b): 1px borders at rest, and the border on hover.
- **Text** (`text`, #0a0a0b / #fafafa), **Text Muted** (`text-2`, #52525b / #a8a8b2) and **Text Faint** (`text-3`, #71717a / #8b8b95): primary copy, secondary copy and controls, then metadata, placeholders and timestamps.

### Named Rules
**The One Ink Rule.** Each view has exactly one filled black action. On Home it is send. In a failed preview it is "Try again". In the chat column it is send, which is dimmed to 25% until there is something to send. Everything else (Dismiss, Close, See where it stopped, the chat's own Try again) is an underlined text button. The one place the ink repeats is a list of equivalent choices, such as the shop's per-pack price buttons, where it is one action offered per row.

**The Violet Is For Pointing Rule.** The accent marks where you are (focus, caret, selection) and where you can go (links). It is never a fill for buttons, never a status and never a decoration, apart from the logo dot and the avatar disc.

**The Four States Rule.** Line, building, live and failed are the whole state vocabulary, and each always uses its own colour triple. Don't invent a fifth state colour, and don't use the status colours for anything that isn't a build state, a log level or the matching tone of feedback.

## Typography

**Display Font:** Geist (via `next/font`, exposed as `--font-sans`, falling back to system-ui)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono (`--font-mono`, falling back to ui-monospace)

**Character:** One neutral grotesk does every job. It is tightened (-0.04em) and heavy (650) for the single hero question, and plain at 14px everywhere else. The mono is not a style. It appears only where the text really is machine output.

### Hierarchy
- **Display** (650, 46px, 1.08, -0.04em; 34px at ≤640px): only the Home question "What should we build?".
- **Numeral** (700, 72px, 1, -0.04em, tabular): your place in line ("#2") in the queued preview state.
- **Title** (600, 18px, -0.01em): preview-state headings ("This build didn't finish", "Building · 1 fix"). The shop heading uses the same weight at 16px.
- **Title Small** (600, 14.5px, 1.35, clamped to two lines): project-card titles. "Your builds" is 15px/600 and the build name in the header is 14px/600.
- **Body Large** (400, 16px; 15px on phones): the hero sub-line, capped at 52ch.
- **Body** (400, 14px, 1.5; 1.6 in chat replies): the base size of the whole app. The prompt textarea runs at 15.5px on Home and 14px in chat. Preview-state copy is capped at 46ch.
- **Label** (600, 13.5px): primary pill buttons. Text buttons, tabs, menu items and the address bar use 13px/500.
- **Label Small** (500, 12.5px): chips, example chips, the mode switch and the view switch. Cost, metadata and the "N log lines" summary use 12px in Text Faint.
- **Status** (600, 11.5px): status pill labels. Chat timestamps use 11px in Text Faint.
- **Mono** (400, 12px, 1.65, pre-wrap): raw log lines, both inside chat replies and in the Log tab, where each line is led by its own `HH:MM:SS` timestamp.

### Named Rules
**The Machine Text Rule.** Monospace is only for raw build output, which includes the log tab's per-line timestamps. Every other number or time (chat timestamps, elapsed time, token balances, tab counts, queue counts) stays in Geist. Figures that update live (elapsed time, balances, counts, the queue numeral) also use `tabular-nums`.

**The One Loud Line Rule.** Display size is used once, for the Home question. Every other heading is 18px or smaller, so the build's content stays the subject.

## Layout

**Home** is a single centred column. The page padding is 13vh at the top (8vh on phones), 20px at the sides and 72px at the bottom. The hero is at most 740px wide. The example chips wrap and are centred, with an 8px gap and 18px of space above them. "Your builds" sits 10vh below the hero in a container up to 1040px wide, as an auto-fill grid of cards at least 240px wide with a 12px gap. The header is transparent on Home.

**Below the fold on Home** (server-rendered, for search engines and first-time visitors): "How the AI app builder works" (three numbered step cards), "Pricing" (the Free card plus one card per credit pack once payments are live, then a bulleted note list and a "Start with N free chats" text link back to the prompt), and "Questions" (FAQ disclosures in surface cards). Each section is up to 1040px wide, 96px apart (64px on phones), headed 26px/700 display (22px on phones) with a 15px Text Muted lead; cards are the project-card treatment (surface, hairline, 14px radius). There is no ink button below the fold: the prompt box keeps the one ink action. The h1 carries a 13px Text Faint eyebrow, "AI website builder", so the page's heading names the product without a second loud line. A frosted footer (brand, How it works, Pricing, FAQ, Privacy, Terms, GitHub) closes Home and the standalone pages (`/privacy`, `/terms`, 404), which use a frosted header with "Start building" as their one ink action and a 720px reading column.

**Build** is a full-viewport screen (100dvh, no page scroll) made of a 56px header and a two-column workspace. The chat column is `minmax(340px, 420px)` and the preview panel takes the rest, separated by a 1px hairline. The chat thread scrolls inside its own column (20px/18px padding, 16px gap between replies) and follows new replies while the reader is at the bottom. The compact prompt box is pinned underneath. The preview panel has 10–12px padding, a bar holding the tabs, address bar and three icon buttons with a 6px gap, and then a bordered body that holds the iframe, the log or a centred state.

**Spacing rhythm:** 4 / 8 / 12 / 16 / 20, with 6px and 10px used inside dense controls. Controls come in 22 / 28 / 30–32 / 34–36px heights.

**Responsive:**
- **≤900px:** the workspace collapses to one column, and chat and preview take turns. A Chat/Preview segmented switch appears in the header, and the shared-line chip leaves the build header.
- **≤640px:** the header tightens to 12px padding. On the build screen the logo is replaced by a back chevron, the build name is hidden, and the status pill switches to its short form ("#2", "Building", "Live", "Failed"). The queue chip and the token chip are dropped, and the balance stays one tap away in the account menu. The account pill shows only the avatar. The hero mode switch uses short labels ("Prompt" / "Repo") so the cost can stay visible. The token shop becomes a bottom sheet with 12px insets.

### Named Rules
**The Taking Turns Rule.** Below 900px, chat and preview are never squeezed side by side. Only one is shown at a time, and the header switch is the way between them.

## Elevation & Depth

The interface is flat at rest, sitting over one atmospheric layer. Depth comes from three things. The first is the backdrop. The second is frosting: the build header is mixed at 82% canvas with an 18px blur, the workspace at 86% with a 24px blur, and the preview panel is tinted with 70% `surface-2`. The third is a very small shadow vocabulary used only on things that lift: the prompt box and floating layers. Cards, chips, tabs and the panel body are separated by hairlines alone. In dark mode the shadows become a 1px hairline ring plus a deep drop, because a soft grey shadow disappears on near-black.

### Shadow Vocabulary
- **Box** (`--shadow-box`: `0 1px 2px rgba(10,10,20,.04), 0 16px 40px -18px rgba(30,20,70,.18)`; dark: `0 0 0 1px var(--line), 0 20px 50px -24px rgba(0,0,0,.8)`): the prompt box at rest, and project cards on hover.
- **Pop** (`--shadow-pop`: `0 1px 3px rgba(10,10,20,.06), 0 20px 44px -16px rgba(10,10,20,.25)`; dark: a `line-strong` ring plus a deep drop): the account menu and the token shop.
- **Thumb** (`0 1px 2px rgba(10,10,20,.1)`): the selected segment of the mode and view switches.
- **Focus halo** (`0 0 0 4px var(--accent-soft)`, added to Box): the prompt box while it has focus.

### Named Rules
**The Frost Rule.** Every surface that holds reading text over the fluid field is frosted (canvas `color-mix` plus `backdrop-filter` blur), or is an opaque `surface`. Text never sits on the raw shader, except on Home, where the canvas is calm and the type is large.

**The Still Field Rule.** Under `prefers-reduced-motion`, the shader renders one fixed frame and all pulses, spins and transitions collapse to effectively zero. The field also stops drawing while the tab is hidden, and falls back to two static radial gradients when WebGL is unavailable.

## Shapes

The shapes are pills and softly rounded rectangles, all with 1px borders. Anything you tap that is a single word or a count is a full pill (999px): primary and send buttons, chips, example chips, status pills, segmented switches and the account pill. Containers step up in radius as they grow: 8px for a tab segment, 10px for icon buttons and raw-log blocks, 11px for the tab bar and address bar, 14px for cards, menus and the preview body, 16px for the chat prompt and chat bubbles, 18px for the token shop, and 20px for the Home prompt box. Your own chat bubble is the one asymmetric shape (16/16/4/16), with the tail corner at the bottom right. Dots are 6–7px circles. A done step is a filled ink disc with a check. A pending step is a 1.5px dashed ring. The live step is a 2px orange ring with a pulsing core. Icons are drawn on a 16px grid with a 1.6 stroke and round caps and joins. The logo is an 8px-radius ink tile with three log lines resolving into a violet endpoint dot.

## Components

### Buttons
Buttons are calm and confident: one black pill, and everything else recedes.
- **Shape:** full pill (999px). The primary is 36px tall with 16px of side padding. Send is a 34px circle with an up arrow.
- **Primary:** ink fill with on-ink text, 13.5px/600. Hover drops the opacity to 0.85, and disabled is 0.4.
- **Send:** ink circle. Hover lifts it 1px. Disabled (when the box is empty) is 0.25, which reads as grey.
- **Text button:** Text Muted, 13px/500, underlined with a 3px offset, with no padding. Hover changes it to Text. This is every secondary action.
- **Icon button:** a 34px square with a 10px radius, a transparent fill, Text Muted and a 17px icon. Hover fills it with `surface-2`. Disabled is 0.35 with a not-allowed cursor; this is also used for "Open site" before a build is live.
- **Focus:** every control gets a 2px violet outline with a 2px offset.

### Chips
- **Header chips:** a 30px surface pill with a hairline border, 12.5px/500 Text Muted and tabular numbers. The shared-line chip ("1 building · 2 waiting") leads with a pulsing orange dot. The token chip is a button with a coin icon, and its border darkens to `line-strong` on hover.
- **Example chips:** 32px surface pills on Home. Tapping one fills the prompt and focuses it. They are shown only in prompt mode.

### Status Pill (signature)
The shared `.status` pill is the only way a build's state is drawn: a 22px pill with a 6px `currentColor` dot and an 11.5px/600 label on the state's soft tint. The labels are "#N in line" (or "In line"), "Building", "Live" and "Failed". The dot pulses (1.2s) only while the build is building. The pill appears in project cards and in the build header. In the phone header it switches to its short form. The address-bar dot in the preview repeats the same state colour.

### Prompt Box (signature)
- **Style:** a surface card with a hairline border and the Box shadow. It has a 20px radius on Home and 16px in chat. The textarea is borderless and grows with its content (`field-sizing: content`) from 84px up to 260px on Home, starting at a single line in chat. Enter sends and Shift+Enter adds a line break.
- **Bar:** a segmented mode switch on the left ("Describe an app" / "GitHub repo"; "Prompt" / "Repo" on phones and in chat), the cost in 12px Text Faint ("5 tokens" or "Free"), and the send button.
- **Focus:** the border turns violet and a 4px Violet Mist halo appears.
- **Blocked:** when signing in is required, the box is replaced by the Google sign-in button, which states the signup grant. Errors appear below it in 13px/500 Fail Ink.

### Cards / Containers
- **Project card:** a surface card with a 14px radius, a hairline border and 14px/16px padding. It has a two-line title, and a meta row holding the status pill plus "Prompt · 4m ago" in 12px Text Faint. Hover darkens the border and adds the Box shadow.
- **Preview body:** a surface card with a 14px radius and a hairline border. It holds the live iframe (always on white), the Log tab, or a centred state. The queued state shows the large numeral, "in line" and a sentence counting what is ahead (running plus waiting). The building state shows a spinner, the current stage with any repair count, the elapsed time and the stage checklist. The failed state shows a red icon disc, the reason, "Try again" in ink and "See where it stopped" as a text button.
- **Menu and token shop:** surface cards with the Pop shadow, opening with a 150ms fade and a 4px drop.

### Chat Replies (signature)
rwaft's replies are plain 14px/1.6 text, one per plain-words step, with no bubble. Each reply carries a disclosure row ("› 3 log lines") that opens a `surface-2` block of mono raw lines, coloured by level. The latest reply stays open while the build is in flight. The reply's tone colours its text: Build Ink for warnings and repairs, and a bold Live or Fail lead-in for the outcome. Your own message is a right-aligned `surface-2` bubble with a timestamp. A live-typing row ("••• rwaft is working", or "Reconnecting to the build…") closes the thread while the build runs.

### Navigation
- **Header:** 56px tall with 16px padding. It holds the logo and wordmark (16px/650, -0.02em), then on the build screen a hairline divider, the build name and status pill. On the right it holds the chips, the theme toggle (sun/moon icon button) and the account pill (avatar, name and chevron, opening a menu with the email, "N tokens · Buy more" and "Sign out"). The header is transparent on Home and frosted with a bottom hairline on the build screen.
- **Tabs (Preview / Log):** a surface tab bar with an 11px radius and 3px padding. The selected tab is filled ink. The Log tab carries a line counter.
- **Address bar:** a 36px surface field with a state dot and the URL without its protocol, followed by copy (which turns into a check for 1.6s), reload (live only) and open-in-new-tab.
- **View switch (≤900px):** Chat / Preview segmented control in the header, same treatment as the mode switch.

## Do's and Don'ts

### Do:
- **Do** keep each view to one filled ink action, and make every other action an underlined text button.
- **Do** draw every build state with the shared status pill (dot plus label), using the short form ("#2", "Building", "Live", "Failed") in the phone header.
- **Do** count everything ahead of a queued build (running plus waiting) when writing queue copy, and say that it starts automatically.
- **Do** offer "Try again" on every failed state (it restores the original prompt or repo into the box), together with a route to the log ("See where it stopped").
- **Do** frost any reading surface over the fluid field (canvas `color-mix` at 82–86% plus an 18–24px `backdrop-filter` blur), and keep the field visible only on Home.
- **Do** define every colour as a token on `:root[data-theme]`, and change only tokens for dark mode, never rules.
- **Do** keep the shader to one still frame, and turn off all pulses and spins, under `prefers-reduced-motion`.
- **Do** use Geist Mono only for raw build output, and Geist for every other number, with `tabular-nums` on figures that update live.

### Don't:
- **Don't** add a second filled black button to a view, or fill a button with the violet accent.
- **Don't** use the four status colours for decoration, categories or anything that isn't a build state, a log level or the matching feedback tone.
- **Don't** put reading text directly on the raw shader in the workspace, or turn the frost down until the beams compete with chat.
- **Don't** show the queue chip or the token chip in the phone header; the balance belongs in the account menu there.
- **Don't** put chat and preview side by side below 900px.
- **Don't** replace the real build with a spinner alone. The building state's spinner always sits with the stage list read from the real log.
- **Don't** add display-size type anywhere except the Home question.
