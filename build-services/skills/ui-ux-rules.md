---
name: ui-ux-rules
description: Interface and UX rules every generated page and change must meet. Loaded by the page and change passes (lib/pages.ts, lib/edit.ts).
sources:
  - Vercel Web Interface Guidelines, MIT, vercel-labs/web-interface-guidelines@434b7f91364665f2f733b310ec54809bf8f37937
  - antislop-ui, antislop-layoutmobile, antislop-copywriting, MIT, miqdadbadjuber/anti-slop@7f6a03df2931c12cb244dc4ab14ee4866b0ac2ba
  - Adapted and condensed for rwaft's pipeline; notices in THIRD_PARTY.md
---

These rules decide whether the page works for the person using it. The design direction decides how it looks; express boldness through type, colour, composition and photography, never by breaking a rule below.

## Structure and semantics

- One `<h1>` per page, then `<h2>`/`<h3>` in order. Never skip a level for styling.
- `<button type="button">` for actions, `<Link to>` for navigation inside the site, `<a href>` for outside links. Never a `<div>` or `<span>` with `onClick`.
- Every `<section>` with a heading has `aria-labelledby` pointing at it, or is plain `<section>`; lists of things are `<ul>`/`<ol>`; tabular data is a `<table>` with `<th scope>`.
- Every link and button names where it goes or what it does: "See the menu", "Book a table", "Send message". Never "Click here", "Learn more" alone, or "Submit".
- An icon-only button has `aria-label`. A decorative icon next to text has `aria-hidden="true"`.
- Every link has a real destination: one of the site's pages, an `#id` that exists on the page, `mailto:`/`tel:`, or a full outside URL. No `href="#"`, no dead nav items.
- Every control does something. A form that has nowhere to send shows a real success state in the page ("Thanks, we'll reply within a day") after validating; it never pretends to have sent an email it did not.

## Interaction and states

- Every interactive element has a visible hover state and a visible `focus-visible:` ring (the kit's Button already does; match it on anything custom). Never `outline-none` without a `focus-visible:ring-*` replacement.
- Hover is a bonus, never the only way in: anything revealed on hover also opens on tap and with the keyboard.
- Tap targets are at least 44×44px (`h-11`/`min-h-11`, or padding), with space between neighbours.
- State changes the user waits for say so: "Saving…", "Sending…". Async messages (form results, toasts) sit in an element with `aria-live="polite"`.
- Every list, search or filter has an empty state that says why it is empty and what to do ("No dishes match "vegan". Clear the filter to see the full menu."). Every error names the problem and the fix.
- Destructive actions (delete, reset, clear) ask for confirmation in the page or offer undo; never act on the first tap.
- Games and tools: keyboard controls for every action, shown on screen; touch controls on small screens; a pause or restart that is always reachable.

## Forms

- Every input has a visible `<label htmlFor>` (or wraps it). Placeholders are examples ending in "…", never the label.
- Use the right `type` and `autoComplete`: `email`, `tel`, `url`, `name`, `given-name`, `street-address`; `inputMode="numeric"` for codes. `spellCheck={false}` on emails and codes.
- Validate on submit, show the error as text right under its field (with an icon or the field's name, so it doesn't rely on colour alone), and move focus to the first error.
- Keep the submit button enabled until sending starts. Never block paste.

## Layout and small screens

- Design the phone width first: one column at 360px, more columns only where content fits (`sm:`, `md:`, `lg:`). Three states (phone, tablet, desktop) where a grid has more than two columns.
- No horizontal scroll at any width: give flex/grid children `min-w-0`, long words `break-words`, tables an `overflow-x-auto` wrapper.
- Size sections to their content. Never `h-screen`/`100vh` on a section; a true full-screen view (a game, a hero that must fill the screen) uses `min-h-dvh`.
- Mobile spacing is its own register: about half the desktop section padding (`py-12 sm:py-20`), smaller headings (`text-3xl sm:text-5xl`), never a fixed px font size.
- Keep line length readable: body copy `max-w-prose` (about 65 characters).
- Long text is handled: `truncate` or `line-clamp-*` where space is fixed, never overflowing its box.

## Images and media

- Every `<img>` has `alt` that says what it shows (or `alt=""` when purely decorative), explicit `width` and `height` matching the URL's size, and `className="… object-cover"` with an aspect ratio so nothing jumps while loading.
- The first, largest image on the page loads eagerly; every other image gets `loading="lazy"`.
- No caption-style labels under photos unless the content needs one (a dish name under its photo is content; "Our beautiful space" is filler).

## Motion

- Motion explains something: an entrance on first view, a hover response, a state change. Nothing pulses, floats or loops forever without the user starting it.
- Animate `transform` and `opacity` only. Never `transition-all`; name the properties (`transition-colors`, `transition-transform`).
- Every animation has a reduced-motion version (`motion-safe:`/`motion-reduce:` variants, or the global reduced-motion rule already in `index.css`).

## Typography and copy

- Use real typographic characters in copy: "…" not "...", curly quotes, and a non-breaking space in "10&nbsp;km" or "5&nbsp;min".
- `tabular-nums` on prices, scores, times and any column of numbers.
- Write like the business would: plain words, active voice, second person, specific nouns. A sentence says what the product does for the reader.
- Never use these words or patterns: unlock, elevate, empower, seamless, cutting-edge, revolutionary, game-changer, next-level, delve, journey (abstract), testament, robust, "in today's fast-paced world", "the future of …", "look no further", "whether you're … or …".
- No emoji in headings, buttons, badges or bullet lists. No all-caps sentences. No eyebrow pill above the `<h1>` repeating what the heading says.

## Honesty

- Never invent social proof: no testimonials, reviews, star ratings, review counts, customer or press logos, "trusted by", user numbers, awards or "since 1998" history, unless the request gives them. Leave the section out instead.
- Offerings, menus, prices and schedules may be realistic samples that fit the request; the owner replaces them.
- Contact details are clearly samples: emails on the `.example` domain (hello@cornercafe.example), no phone number in a real dialable format (use the request's, or omit the phone), addresses as street and district only, no house number or postcode.
- Numbers on dashboards and tools come from the app's own state or are clearly sample data; never a fake "+12% this week" trend.

## Visual restraint

- One accent, used at the moment that matters (the main action, the current item). Not on every icon, border and badge.
- Shadows mark elevation for the one or two things that float; everything else sits flat on the page. No glow on cards, buttons or text.
- No blurred colour orbs, rainbow or blue-to-purple gradients, dot or grid backgrounds, glassmorphism on several surfaces, or colored stripes on card edges unless they carry meaning.
- No arrow on every button: one direction cue on the action that leads somewhere.
- Icons only where they help recognition and relate to the item (a cup for coffee, a calendar for booking). Never sparkles, stars, rockets or lightning as generic feature icons; a feature without a fitting icon gets none.
- Vary the composition from section to section: not every section is a centred title, a subtitle and a grid of identical cards. Give the most important item more room than the rest.
