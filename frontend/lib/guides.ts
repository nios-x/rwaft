import type { Article } from "./articles"
import { ROUNDUP_PATH } from "./compare"

/**
 * /guides: the questions people search before they pick a builder ("how to
 * build a website with AI", "what is vibe coding"), answered for any tool,
 * with rwaft as one option among several. Other products are described only
 * as lib/compare.ts describes them, so the two can't disagree.
 */

export interface Guide extends Article {
	/** ISO dates, for the Article structured data and the byline. */
	published: string
	updated: string
}

export const GUIDES: Guide[] = [
	{
		slug: "how-to-build-a-website-with-ai",
		name: "How to build a website with AI",
		title: "How to build a website with AI, step by step",
		description:
			"A plain-words guide to building a website with AI: plan it, write the prompt, pick a builder, check it on a phone and share it. No code needed.",
		heading: "How to build a website with AI, step by step",
		lead: "You can go from an idea to a live website in minutes now, without writing code. Here's how to do it well, whichever AI builder you use.",
		published: "2026-10-24",
		updated: "2026-10-24",
		sections: [
			{
				heading: "1. Decide what the site is for",
				body: [
					"Before you write anything, answer two questions: who will visit, and what should they do there? Book a table, hire you, RSVP, buy a ticket. Everything on the page should help with that one thing.",
				],
			},
			{
				heading: "2. Gather the real content",
				body: [
					"AI is good at layout and wording, but it can't know your prices, your hours or your story. Write those down first: names, prices, dates, links to your photos, and the buttons you need. Anything you leave out comes back as placeholder text.",
				],
			},
			{
				heading: "3. Pick the right kind of builder",
				body: [
					{
						list: [
							"For a website or front-end app with a live link and nothing to learn: a prompt-to-site builder like rwaft",
							"For an app with accounts, data or payments: a full-stack AI app builder like Lovable, Base44, Bolt or Replit",
							"To design every detail yourself: a website builder with AI, like Framer, Webflow or Wix",
						],
					},
					{ link: { text: "Who each one is best for:", href: ROUNDUP_PATH, label: "the best AI app and website builders" } },
				],
			},
			{
				heading: "4. Write the prompt",
				body: [
					"Describe the site the way you'd brief a person: what it is, who it's for, the pages or sections, the real content and the look. A paragraph is plenty.",
					{ link: { text: "More on this:", href: "/docs/writing-prompts", label: "writing a good prompt" } },
				],
			},
			{
				heading: "5. Check the first version on a phone",
				body: [
					"Most visitors arrive on a phone, so open the link on yours. Check that every button goes where it should, every price and date is right, and nothing still says “lorem ipsum”.",
				],
			},
			{
				heading: "6. Change it in plain words",
				body: [
					"With a chat-based builder you don't hunt through menus: you say what to change. Keep each message to one or two changes, so you can check them.",
				],
			},
			{
				heading: "7. Share it where people will find it",
				body: [
					{
						list: [
							"Your social media bios",
							"Your Google Business Profile, if you're a local business",
							"Email signatures, QR codes on anything printed, and messages to the people it's for",
						],
					},
				],
			},
		],
		share: ["Build a website", "with AI, step by step."],
	},
	{
		slug: "ai-website-prompts",
		name: "40 prompts for AI website builders",
		title: "AI website prompts: 40 examples to copy",
		description:
			"40 example prompts for AI website builders, from landing pages and portfolios to menus, quizzes and games. Copy one, change the details, build it.",
		heading: "40 prompts for AI website builders",
		lead: "The fastest way to a good AI-built site is to start from a prompt that already works. Pick one, swap in your own details and send it. Each one opens straight in rwaft.",
		published: "2026-10-24",
		updated: "2026-10-24",
		sections: [
			{
				heading: "Landing pages",
				body: [
					{
						prompts: [
							"A landing page for a budgeting app for students, with features, pricing and an FAQ",
							"A launch page for a handmade candle shop with a link to join the waitlist",
							"A landing page for a meal-prep service with weekly menus, three plans and a button to order on WhatsApp",
							"A one-page site for a podcast with recent episodes and where to listen",
							"A landing page for a browser extension that blocks distracting sites, with a how-it-works section and an install button",
							"A coming-soon page for a sneaker brand with a countdown to launch day and a link to our Instagram",
						],
					},
				],
			},
			{
				heading: "Portfolios and resumes",
				body: [
					{
						prompts: [
							"A portfolio for a wedding photographer with a gallery, an about page and contact details",
							"A developer portfolio with my projects, my skills and a link to my GitHub",
							"A minimal portfolio for a UX designer with three case studies",
							"A resume website for a junior data analyst with experience, skills, education and a contact section",
							"A portfolio for an illustrator with a grid of work, how commissions work and a contact email",
							"A personal site for a freelance copywriter with services, rates and samples of my writing",
						],
					},
				],
			},
			{
				heading: "Restaurants, shops and local businesses",
				body: [
					{
						prompts: [
							"A menu page for a small café with breakfast, lunch and drinks",
							"A website for an Italian restaurant with the menu, opening hours, location and a phone number for bookings",
							"A website for a hair salon with services and prices, opening hours and a booking link",
							"A site for a local plumber with services, the areas we cover and a big call button",
							"A website for a yoga studio with the class timetable, teachers and prices",
							"A website for a bike repair shop with services, prices, opening hours and a map link",
						],
					},
				],
			},
			{
				heading: "Events, weddings and birthdays",
				body: [
					{
						prompts: [
							"A wedding website with our story, the schedule, the venue, the dress code and a link to RSVP",
							"A party page for my 30th birthday with the date, the address, a playlist link and a link to RSVP",
							"A birthday page for my dad's 60th with a message from each of us and a quiz about his life",
							"An event page for a tech meetup with the agenda, three speakers and a link to register",
							"A page for a charity fun run with the route, the start time, how to sign up and a donate button",
							"A baby shower page with the date, the place, a gift registry link and a countdown",
						],
					},
				],
			},
			{
				heading: "Communities, causes and classes",
				body: [
					{
						prompts: [
							"A website for a dog rescue charity with dogs for adoption, how to volunteer and a donate button",
							"A website for a small church with Sunday service times, a welcome for first-time visitors and directions",
							"A site for a book club with this month's book, the meeting schedule and our past picks",
							"A school project website about the water cycle with each stage explained and a short quiz at the end",
							"A page for a Sunday league football team with fixtures, results and how to join",
						],
					},
				],
			},
			{
				heading: "Tools and web apps",
				body: [
					{
						prompts: [
							"A habit tracker with daily check-ins, streaks and a weekly chart, saved in the browser",
							"A tip calculator that splits the bill between friends",
							"A pomodoro timer with work and break sessions, a sound when time is up and a dark mode",
							"A packing list app for trips, with categories and checkboxes saved in the browser",
							"A 10-question quiz about the solar system with an explanation after each answer",
							"A flashcard app for learning Spanish verbs, with a score and a button to retry the ones I missed",
						],
					},
				],
			},
			{
				heading: "Games",
				body: [
					{
						prompts: [
							"A snake game with a high score saved in the browser and controls that work on a phone",
							"A memory card-matching game with emoji, a move counter and a timer",
							"A typing speed test that shows words per minute and accuracy",
							"A side-scrolling game where a cat flaps between pipes, with a score and a restart button",
							"A daily word-guessing game with five-letter words, coloured hints and an on-screen keyboard",
						],
					},
				],
			},
			{
				heading: "Make any prompt better",
				body: [
					{
						list: [
							"Swap in your real names, prices and wording",
							"Say who it's for and what they should do there",
							"Name the pages you want, up to five",
							"Describe the look in a few words: calm and minimal, bold, playful",
						],
					},
					{ link: { text: "The full checklist:", href: "/docs/writing-prompts", label: "writing a good prompt" } },
				],
			},
		],
		share: ["40 prompts", "to build from."],
	},
	{
		slug: "what-is-vibe-coding",
		name: "What is vibe coding?",
		title: "What is vibe coding? A plain-words guide",
		description:
			"Vibe coding means building software by describing it to an AI instead of writing code. What it is, the tools for it, where it works and where it doesn't.",
		heading: "What is vibe coding?",
		lead: "Vibe coding is building software by describing what you want to an AI and letting it write the code. You judge the result by trying it, not by reading the code.",
		published: "2026-10-24",
		updated: "2026-10-24",
		sections: [
			{
				heading: "Where the term comes from",
				body: [
					"The AI researcher Andrej Karpathy coined it in February 2025, for a way of programming where you “fully give in to the vibes” and forget that the code even exists. It caught on fast, because it named something a lot of people had started doing.",
				],
			},
			{
				heading: "How it works",
				body: [
					{
						steps: [
							"You describe what you want in plain words.",
							"An AI model writes the code, often many files at once.",
							"The tool runs or builds it and shows you the result.",
							"You try it and say what to change, and the loop repeats.",
						],
					},
				],
			},
			{
				heading: "Vibe coding tools",
				body: [
					{
						list: [
							"Prompt-to-app builders, which handle the code and the hosting: Lovable, Bolt, v0, Replit, Base44 and rwaft",
							"AI code editors for developers, like Cursor, Windsurf and GitHub Copilot, which work inside a codebase you manage",
							"Website builders with AI, like Framer, Wix and Webflow, which draft a site you then edit visually",
						],
					},
					{ link: { text: "Side by side:", href: "/compare", label: "how the prompt-to-app builders compare" } },
				],
			},
			{
				heading: "Where it works well",
				body: [
					{
						list: [
							"Websites, landing pages and portfolios",
							"Prototypes and demos, to test an idea before investing in it",
							"Small personal tools: trackers, calculators, quizzes and games",
							"Internal tools with a few users, on builders that include a back end",
						],
					},
				],
			},
			{
				heading: "Where to be careful",
				body: [
					{
						list: [
							"Anything that handles money, health data or personal information: have someone who can read code review it",
							"Security: AI-written code can have holes you won't find by trying it",
							"Long-lived products: someone eventually has to understand the code to maintain it",
							"Facts and figures the AI writes into your site: check them",
						],
					},
				],
			},
			{
				heading: "Vibe coding with rwaft",
				body: [
					"rwaft is vibe coding for websites, with the curtain open. You describe a site, and instead of a spinner you watch the real build: the plan, the installs, the build output and the fixes rwaft makes when something breaks. The result is a React and TypeScript app at its own link.",
					{ link: { text: "See it in", href: "/trailer", label: "the 29-second trailer" } },
				],
			},
		],
		share: ["What is", "vibe coding?"],
	},
	{
		slug: "host-a-lovable-or-bolt-project",
		name: "Host a Lovable or Bolt project elsewhere",
		title: "How to host a Lovable or Bolt project elsewhere",
		description:
			"Move a Lovable or Bolt app to other hosting: get the code into a repository, check what it depends on, and deploy it with rwaft or another host.",
		heading: "How to host a Lovable or Bolt project somewhere else",
		lead: "Lovable builds Vite React apps, and many Bolt projects are too. The front end of a Vite app runs on almost any static host. Here's how to move one, and what won't come with it.",
		published: "2026-10-24",
		updated: "2026-10-24",
		sections: [
			{
				heading: "1. Get the code into a repository",
				body: [
					"In Lovable, connect the project to GitHub and it syncs the code to a repository on your account. In Bolt, export the project and push it to a repository.",
				],
			},
			{
				heading: "2. Check what kind of app it is",
				body: [
					"Open package.json. If vite is among the dependencies and there's a build script, it's a Vite app, which can be hosted as static files. A Next.js app needs a host that runs servers.",
				],
			},
			{
				heading: "3. Check what it depends on",
				body: [
					{
						list: [
							"A back end: apps that use Lovable Cloud, Bolt's databases or Supabase keep needing them. The front end can move; the data stays where it is",
							"Environment variables: if the code reads keys from import.meta.env, the new host has to provide them",
							"Sign-in redirects: if the app signs people in, add the new address to your auth provider's allowed redirect URLs",
						],
					},
				],
			},
			{
				heading: "4. Deploy it",
				body: [
					"With rwaft: make the repository public, switch the home screen's box to “GitHub repo” and paste its URL. rwaft installs it, builds it and hosts it at its own link, with the full build log in front of you.",
					"rwaft can't set environment variables yet, so an app that needs them won't work there until it can. A host that lets you set them, like Netlify, Vercel or Cloudflare Pages, will.",
				],
			},
			{
				heading: "5. Test the live site",
				body: [
					{
						list: [
							"Open every page directly, not only from the home page, to check its route works",
							"Try sign-in, forms and anything that loads data",
							"Check it on a phone",
						],
					},
					{ link: { text: "Everything rwaft needs from a repository:", href: "/docs/deploy-a-repo", label: "deploying a repository" } },
				],
			},
		],
		share: ["Move your app.", "Keep it live."],
	},
]

export const findGuide = (slug: string) => GUIDES.find((item) => item.slug === slug)
