---
name: site-planning
description: How to choose a site's pages and sections from what the subject is. Loaded by the planner (lib/plan.ts).
sources:
  - tasteskill (design-taste-frontend) sections 1 and 2, MIT, leonxlnx/taste-skill@f6b76575f949707b4e3c37cd86cb44b0b98643e8
  - antislop-ui "Layout & Components" and "App & Dashboard", MIT, miqdadbadjuber/anti-slop@7f6a03df2931c12cb244dc4ab14ee4866b0ac2ba
  - Adapted and condensed for rwaft's pipeline; notices in THIRD_PARTY.md
---

## The kind of subject decides the plan

Before choosing pages, name what the request is. It decides what leads every page, what the visitor came to do, and how much effect the design may use.

| The request is | Kind | What leads | What the visitor came to do |
|---|---|---|---|
| A cafe, restaurant, bakery, bar, shop, salon, gym, hotel, venue: people come to it | place | photographs of the place, its food or goods | find what is offered, when it is open, where it is, how to book or order |
| A physical product or brand sold online | product | the product, large, from more than one angle | understand it, see it in use, choose a variant, buy |
| People are hired: clinic, therapist, lawyer, agency, tradesperson, photographer, freelancer | service | the work and the people who do it | see the work, trust the person, know the price or process, get in touch |
| Software, an app, an AI or developer tool | software | the product's own interface doing its job | see what it does, try it or sign up |
| A game | game | the game itself, playable on the first screen | play |
| A single-purpose tool: calculator, tracker, converter, quiz, timer | tool | the tool, working, on the first screen | use it right away |
| A person: portfolio, resume, link-in-bio | personal | the person's work, then the person | look at the work, contact or hire |
| An event: wedding, party, meetup, launch | event | what, when, where | know the plan, RSVP |

## Page plans by kind

- **Place.** Home: a photograph-led hero naming the place and its one main action (book, order, visit); opening hours and location early (second section), not buried in the footer; the offer (menu, products, services) as real items with prices; the place itself. Separate pages only for what visitors look up on their own: Menu, Visit (hours, map, getting there), Book or Order. Photographs, flat colour and type carry the design; no shader-like effects, glows or dark "tech" themes.
- **Product.** Home: the product large in the hero, then one section per real reason to buy, each with a different picture; variants and price; how to get it. A product never shrinks to a mid-sized card on a grey panel.
- **Service.** Home: what is offered, for whom, in plain words; the work (cases, portfolio, before/after); who does it; how it works and what it costs, if known; one clear way to get in touch. A contact page with a working form is usually worth its own page.
- **Software.** Home: the product's interface built as real UI in the hero showing a concrete task (a code-review tool shows a diff with its Accept button), never a generic dashboard or a fake terminal; then each capability shown working; pricing only if the request gives a pricing model. Dark mode only when the audience expects it.
- **Game.** One bare page. The first screen is the game: a start screen with the controls shown, then playing, paused, and game-over-with-restart states. Score and best score visible.
- **Tool.** One bare page unless the request needs more. The first screen is the working tool with sensible defaults already filled in, results visible as you type, an explanation below it at most.
- **Personal.** The work leads, the person follows: selected work with one line each, a short about, then contact. A resume adds experience and skills as scannable lists.
- **Event.** What, when, where on the first screen; schedule; venue and travel; RSVP form; FAQ only if the request raises questions to answer.

## Sections earn their place

- Plan sections from what this subject has, not from a landing-page template. "Hero, features, how it works, testimonials, pricing, FAQ, CTA" in that order, every time, is the template; do not default to it.
- No testimonials, reviews, logo bars, "trusted by", stats or awards sections unless the request supplies the content. Leave the section out; never plan invented proof.
- No pricing section with three tiers and a highlighted middle one unless the request describes tiers. Plan as many options as the business really has.
- "How it works" only when there is a real process, with as many steps as it really has.
- A section that would repeat another (a second CTA band saying the same thing) is cut.
- Name each section by its real content: "Opening hours and map to the Old Town shop", not "Info section".
- Vary the shape of consecutive sections: a full-width photograph, then a two-column text-and-list, then a grid. Note the intended shape in the section name when it matters ("Menu as a two-column price list").

## Design direction by kind

- Choose light or dark from the subject and audience, not from "it looks modern". Places, products, services, personal and event sites are usually light; dark needs a reason (nightlife, a game, a developer tool, a cinema).
- The palette is one neutral base, one or two supporting colours and one accent; the accent is for the main action.
- Pick fonts for the subject's character: a serif for a bakery or a law firm can be right; a display face for a game; a sober sans for software. Never pick a face only because it is common.
