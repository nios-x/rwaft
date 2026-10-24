# Launch and outreach kit

Everything off the site that decides how rwaft ranks: links from other sites, brand searches, and being listed where people compare AI builders. The site itself is ready for it (see the pages in `frontend/lib/compare.ts`, `useCases.ts`, `docs.ts` and `guides.ts`).

Two rules for everything below, the same as on the site:

- **No invented proof.** No user counts, ratings, testimonials or "trusted by". None exist yet.
- **Say you're the maker** whenever you post about rwaft somewhere you don't own.

---

## 1. Search engines (do first)

**Google Search Console** (verified):

1. Sitemaps → submit `https://rwaft.live/sitemap.xml`.
2. URL Inspection → *Request indexing* for each of these, a few a day:
   - `https://rwaft.live/` (this also gets Google to fetch the new logo)
   - `/compare`, `/compare/best-ai-app-builders`, `/compare/lovable-alternative`, `/compare/bolt-alternative`, `/compare/v0-alternative`, `/compare/replit-alternative`, `/compare/lovable-vs-bolt`
   - `/make`, `/docs`, `/guides`, `/pricing`
3. Each week, check **Performance → Queries** for what you show up for, and **Security issues**. Every user site lives on `*.rwaft.live`, so a phishing page built by one person can get the whole domain flagged. Take it down the day you see it.

**Bing Webmaster Tools** (bing.com/webmasters): *Import from Google Search Console*. Bing results also feed ChatGPT search, Copilot and DuckDuckGo. After that, the IndexNow workflow (`.github/workflows/indexnow.yml`) tells Bing about changed pages after every production deploy.

---

## 2. Launch posts

### Product Hunt

- **Name:** rwaft
- **Tagline** (60 max): `Describe an app, watch it build, get a live link`
- **Description** (260 max):
  > rwaft is an AI app and website builder for people who don't code. Describe a site in plain words, then watch the real build: the plan, the installs, and the fixes when something breaks. Get a live link to share. Flat price per chat, no subscription.
- **Topics:** Artificial Intelligence, No-Code, Website Builder, Developer Tools
- **Gallery:** the 29-second trailer (`frontend/public/video/rwaft-overview.mp4`), then screenshots of the prompt box, a build in progress with the log open, and a finished site on a phone.
- **Maker comment:**
  > Hi Product Hunt! I built rwaft because most prompt-to-app tools show a spinner and hand you something you have to take on trust. rwaft streams the actual work instead: the AI planning your pages, npm installing, the bundler running, and the repairs it makes when a build fails. Then it hosts the site at its own link.
  >
  > It's deliberately narrow. It makes websites and front-end apps (React + TypeScript on Vite, Tailwind), not full-stack products. If you need a database or logins, Lovable or Bolt will serve you better, and the compare page on the site says so.
  >
  > You get 2 free credits on sign-up. Every chat costs the same however big the change, failed builds are refunded automatically, and there's no subscription. I'd love to hear what you build, and where it breaks.

Launch on a Tuesday–Thursday, 00:01 Pacific. Reply to every comment that day.

### Show HN

- **Title:** `Show HN: rwaft – describe a website, watch the real build, get a live link`
- **Text:**
  > rwaft turns a plain-language description into a deployed React site. The part I cared about most is that nothing is hidden: the browser gets the build log over Server-Sent Events as it happens. You see the AI plan the pages, the npm install, the Vite build, and the repair loop when the build fails, where the model reads the error and patches the file.
  >
  > Stack: generated apps are React + TypeScript on Vite with Tailwind. The pipeline is a Bun API and worker in Docker (Render), with builds queued one at a time per worker. The site is Next.js on Vercel. It can also deploy a public Vite or Create React App repo, and it patches the usual CRA-on-modern-Node build failures.
  >
  > Limits, honestly: front end only (no database, no auth, no payments), sites are public, there are no custom domains yet, and code is kept for 24 hours after a build. Two free credits on sign-up.
  >
  > Happy to answer anything about the repair loop or the queue.

Post it on a weekday morning US time, and stay in the thread for the first three hours.

### Also launch on

Each of these is a free listing with a link back: **Indie Hackers** (products), **Peerlist** launchpad, **DevHunt**, **Uneed**, **BetaList**, **Microlaunch**, **SaaSHub**. Space them over two weeks rather than one day.

---

## 3. Directories and "alternatives" sites

Submit to each one. Most take a week or two to approve.

| Where | What to do |
|---|---|
| **AlternativeTo** (alternativeto.net) | Add rwaft, then add it as an alternative to **Lovable, Bolt.new, v0, Replit, Base44 and Framer**. Its "Lovable alternatives" pages rank for exactly those searches. |
| There's An AI For That | Submit, with category "Website builder" |
| Futurepedia | Submit, with categories "No-code", "Website builders" |
| Toolify.ai | Submit |
| TopAI.tools | Submit |
| FutureTools | Submit |
| G2 and Capterra | Create the listing now; reviews come later, from real users only |

**Short description** (under 160 characters):
> AI app and website builder: describe a site in plain words, watch the real build, and get a live link. Flat price per chat, no subscription.

**Long description:**
> rwaft is an AI app and website builder for people who don't write code. Describe what you want (a landing page, a portfolio, a menu, a quiz, a small game) and rwaft's AI plans the pages, writes a React and TypeScript app, builds it and hosts it at its own link. Instead of a spinner, you watch every step in plain words, with the raw build log one tap away, including the fixes rwaft makes when a build breaks. Change the site by sending a follow-up message. You can also deploy a public Vite or Create React App repository. New accounts get free credits; after that, every chat costs the same however big the change, with one-off credit packs, no subscription, and automatic refunds for failed builds.

**Tags:** AI website builder, AI app builder, no-code, vibe coding, landing page generator, React, Lovable alternative

---

## 4. Get into existing "alternatives" articles

This is the honest way to show up when people search for Lovable, Bolt or v0.

1. Search Google for each of: `lovable alternatives`, `bolt.new alternatives`, `v0 alternatives`, `best ai app builder`, `best ai website builder`, `free ai website builder`.
2. List the top 20 articles across them that aren't written by a competitor.
3. Find the author or the site's editor, and send something like this, personalized each time:

> **Subject:** A free-to-try addition for your Lovable alternatives list
>
> Hi {name},
>
> I read your piece on {article title}. It's one of the clearer ones on {the specific thing they did well}.
>
> I make rwaft, an AI website builder for non-coders. It takes a different angle from the tools you covered: it streams the real build step by step instead of a spinner, and it charges a flat price per chat with no subscription, refunding failed builds. It only does websites and front-end apps, so it's not a full Lovable replacement, and I'd rather you said that than oversold it.
>
> If it's useful for your readers, I'm happy to add free credits to your account so you can try it properly: {link}.
>
> Thanks either way,
> {your name}

Expect a few replies per 20. One link from an article that already ranks is worth more than every directory combined.

---

## 5. Communities

- **Reddit**: r/nocode, r/SideProject, r/webdev (*Showoff Saturday* only), r/indiehackers. The best posts don't announce anything. Answer the "is there a cheaper Lovable alternative?" and "how do I make a website without coding?" threads with a real answer, mention rwaft as one option, and say you made it. Reddit threads now rank high in Google for these searches.
- **X**: build in public from @soumya_7708. Post short screen recordings of real builds, and the repair loop especially, since that's what no one else shows.

---

## 6. YouTube

Short videos rank in Google for "build a … with AI" searches. Each one points to its /make page:

1. "I built a restaurant website with AI in 3 minutes" → `/make/restaurant-website`
2. "AI built my portfolio from one sentence" → `/make/portfolio-website`
3. "Making a birthday surprise website with AI" → `/make/birthday-website`
4. "Watch an AI fix its own build error" → `/how-it-works`
5. "Lovable vs Bolt vs rwaft: same prompt, three results" → `/compare/lovable-vs-bolt`. Run it fairly, and show where the others win.

Upload the trailer too, and link the channel from the Organization `sameAs` in `frontend/app/layout.tsx` once it exists. Do the same for the Product Hunt, LinkedIn and GitHub pages as you create them.

---

## 7. What to expect

| Search | Page | Realistic timing |
|---|---|---|
| rwaft | `/` | Sitelinks 1–3 months after indexing, as brand searches grow |
| ai {portfolio / wedding / restaurant / birthday} website builder | `/make/*` | Top 10 in 1–3 months |
| lovable / bolt / v0 / replit alternative | `/compare/*` | Top 10 in 2–4 months, with links from sections 3–4 |
| lovable vs bolt | `/compare/lovable-vs-bolt` | 3–6 months |
| best ai app builder | `/compare/best-ai-app-builders` | 6+ months |
| ai website builder | `/` | 12+ months; it needs real authority |

Re-check every competitor's pricing page every couple of months, update `frontend/lib/compare.ts`, and move `COMPARED_ON`. Pages that stay accurate keep their rankings.
