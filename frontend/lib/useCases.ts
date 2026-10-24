/**
 * The /make pages: one per kind of site people search for ("AI portfolio
 * website builder", "AI game generator"), each answering what to ask for,
 * what comes back and where the limits are.
 *
 * Every claim must hold for the real pipeline (build-services): sites are
 * front-end only, mobile-first, public at their own link, and an edit
 * publishes a new version at a new link. Nothing here may promise a database,
 * accounts, payments or a custom domain, or quote users and results that
 * don't exist.
 *
 * The route is /make, not /build: the repository's .gitignore drops every
 * folder named build, so app/build would never reach the deployment.
 */

export interface UseCaseFaq {
	question: string
	answer: string
}

export interface UseCase {
	slug: string
	/** Short name for links, cards and breadcrumbs. */
	name: string
	/** One line for the /make cards and the footer. */
	blurb: string
	/** The page title; the layout's template appends " · rwaft". Keep it under 52 characters. */
	title: string
	/** Under 160 characters. */
	description: string
	heading: string
	lead: string
	/** Real prompts; each one opens the console with it in the box. */
	examples: string[]
	/** What to put in the prompt. */
	include: string[]
	/** What comes back, specific to this kind of site. */
	get: { title: string; body: string }[]
	/** The honest limit for this kind of site, and the way around it. */
	note: string
	faq: UseCaseFaq[]
	/** Share card headline, one entry per line. */
	share: [string, string]
	/** "deploy" opens the console on the repository box instead of the prompt. */
	mode?: "prompt" | "deploy"
}

export const USE_CASES: UseCase[] = [
	{
		slug: "landing-page",
		name: "Landing page",
		blurb: "A page for a product, an app or a launch, with one clear call to action.",
		title: "AI landing page generator: describe it, go live",
		description:
			"Describe your product and rwaft's AI writes, builds and hosts a landing page at its own link in minutes. No code, no template to fight, no subscription.",
		heading: "AI landing page generator",
		lead: "Say what you're launching and who it's for. rwaft plans the sections, writes the page as a real React app and puts it live at its own link, while you watch every step.",
		examples: [
			"A landing page for a budgeting app for students, with features, pricing and an FAQ",
			"A launch page for a handmade candle shop with a link to join the waitlist",
			"A one-page site for a podcast with recent episodes and where to listen",
		],
		include: [
			"What you're offering, in one sentence",
			"Who it's for, and the one thing they should do: sign up, buy, book a call",
			"The sections you want, like features, pricing or an FAQ",
			"Real quotes if you want testimonials; otherwise leave them out",
			"A feel for the look: calm and minimal, bold and colourful, dark",
		],
		get: [
			{ title: "Sections in a sensible order", body: "A first screen with your headline and main button, then the sections you asked for, all on one design." },
			{ title: "Made for phones too", body: "Pages are written mobile-first, so they read as well on a phone as on a laptop." },
			{ title: "A link right away", body: "The page is hosted at its own address the moment the build passes. Send it to anyone." },
		],
		note: "rwaft builds the page, not a back end, so it can't collect sign-ups or take payments by itself. Point your buttons at a form or checkout you already use, like Google Forms, Tally or a Stripe payment link, and put that link in your prompt.",
		faq: [
			{
				question: "Can I connect a waitlist or sign-up form?",
				answer: "Yes, by linking to one. rwaft's sites don't have a database of their own, so give it the link to a form you already use and it wires your buttons to it.",
			},
			{
				question: "Can I use my own domain?",
				answer: "Not yet. Each site lives at its own rwaft.live address, which you can share anywhere.",
			},
		],
		share: ["A landing page,", "live in minutes."],
	},
	{
		slug: "portfolio-website",
		name: "Portfolio website",
		blurb: "Your work, a short bio and a way to reach you, at a link for your CV.",
		title: "AI portfolio website builder for creatives and devs",
		description:
			"Make a portfolio website by describing your work. rwaft's AI designs it, builds it as a React site and hosts it at a link you can put on your CV.",
		heading: "AI portfolio website builder",
		lead: "Describe your work and the impression you want to leave. rwaft lays out the pages, writes the site and hosts it, so you have a link for your CV, your bio or your next pitch.",
		examples: [
			"A portfolio for a wedding photographer with a gallery, an about page and contact details",
			"A developer portfolio with my projects, my skills and a link to my GitHub",
			"A minimal portfolio for a UX designer with three case studies",
		],
		include: [
			"Your name and what you do",
			"The projects to show, with a line about each",
			"The pages you want, such as work, about and contact",
			"Links to your profiles: GitHub, Behance, Dribbble, Instagram or LinkedIn",
			"The mood: quiet and editorial, bold, playful",
		],
		get: [
			{ title: "Your work, laid out", body: "A project grid or gallery that holds up on any screen, with a page or section for each piece." },
			{ title: "Several pages if you want them", body: "Ask for work, about and contact pages and rwaft adds the navigation between them." },
			{ title: "Easy to change", body: "Add a project or rewrite your bio with a follow-up message, and rwaft publishes the new version." },
		],
		note: "You can't upload files to rwaft yet. If your images are already online, put their links in your prompt and rwaft uses them; otherwise it leaves placeholders you can replace in a follow-up.",
		faq: [
			{
				question: "Can I add my own photos?",
				answer: "Yes, if they're online already. Include the image links in your prompt or a follow-up and rwaft puts them in place.",
			},
			{
				question: "Will my portfolio work on phones?",
				answer: "Yes. rwaft writes every page mobile-first, so it works on phones, tablets and laptops.",
			},
		],
		share: ["Your portfolio,", "from one sentence."],
	},
	{
		slug: "restaurant-website",
		name: "Restaurant & café website",
		blurb: "Your menu, opening hours and directions, readable on a guest's phone.",
		title: "AI restaurant website builder: menu, hours, map",
		description:
			"Describe your café or restaurant and rwaft's AI builds a website with your menu, opening hours and contact details, hosted at its own link.",
		heading: "AI website builder for restaurants and cafés",
		lead: "Give rwaft your menu, your hours and the feel of the place. It builds a site guests can open on their phone, with a link for your Google listing, your Instagram bio or a QR code on the table.",
		examples: [
			"A menu page for a small café with breakfast, lunch and drinks",
			"A website for an Italian restaurant with the menu, opening hours, location and a phone number for bookings",
			"A one-page site for a taco truck with this week's menu and where to find us",
		],
		include: [
			"The menu with prices, grouped the way you serve it",
			"Opening hours and your address",
			"How to book or order: a phone number, an email, or a link you already use",
			"Links to photos you have online, or the mood: rustic, modern, cosy",
		],
		get: [
			{ title: "A menu made for phones", body: "Dishes grouped and priced, easy to read at the table or in the queue." },
			{ title: "Hours and directions", body: "Opening hours, your address, and a link that opens it in maps." },
			{ title: "Changes in a sentence", body: "New dish or new hours? Send something like “add pumpkin soup at $7” and rwaft publishes the update." },
		],
		note: "rwaft sites don't take orders or bookings themselves. Link to the booking or delivery service you use, or give a phone number, and rwaft puts it where guests look first.",
		faq: [
			{
				question: "Can guests order or book through the site?",
				answer: "Through a service you already use. rwaft sites have no back end, so give it your booking or delivery link and it adds the buttons.",
			},
			{
				question: "How do I change the menu later?",
				answer: "Send the change as a follow-up in the same chat. rwaft edits the site and publishes the new version at a new link, so update the link you share. A build's code is kept for a day; after that, describe the whole site again.",
			},
		],
		share: ["Your menu,", "online tonight."],
	},
	{
		slug: "small-business-website",
		name: "Small business website",
		blurb: "Services, prices and a way to get in touch, for a shop, studio or trade.",
		title: "AI website builder for small businesses",
		description:
			"Describe your business and rwaft's AI builds a website with your services, prices and contact details, hosted at its own link. No code or subscription.",
		heading: "AI website builder for small businesses",
		lead: "Tell rwaft what you do, where, and how customers reach you. It writes a site with the pages a customer looks for and hosts it at its own link, in minutes rather than weeks.",
		examples: [
			"A website for a hair salon with services and prices, opening hours and a booking link",
			"A site for a local plumber with services, the areas we cover and a big call button",
			"A website for a yoga studio with the class timetable, teachers and prices",
		],
		include: [
			"What you do and where you do it",
			"Your services, with prices if you share them",
			"Opening hours, the areas you cover and how to contact you",
			"Real reviews only, word for word, if you want them on the site",
			"The look: trustworthy and plain, warm, premium",
		],
		get: [
			{ title: "The pages customers expect", body: "Usually a home page, services, about and contact, sharing one header and footer." },
			{ title: "A clear way to reach you", body: "Call, email or booking buttons wherever a customer is ready to act." },
			{ title: "Yours to adjust", body: "New prices, a new service or holiday hours are one message away." },
		],
		note: "Contact forms need somewhere to send their answers, and rwaft sites have no back end. Use a phone number, an email link, or a form service you already have, and say which in your prompt.",
		faq: [
			{
				question: "Will my business site show up on Google?",
				answer: "It's a public site that anyone can open, so search engines can find it, but rwaft doesn't submit it or promise a ranking. Linking it from your Google Business Profile and social pages is the quickest way to get it seen.",
			},
			{
				question: "Can I use my own domain?",
				answer: "Not yet. Each site lives at its own rwaft.live address.",
			},
		],
		share: ["Your business,", "online in minutes."],
	},
	{
		slug: "wedding-website",
		name: "Wedding website",
		blurb: "Your story, the day's schedule, the venue and an RSVP link for guests.",
		title: "AI wedding website builder: schedule, venue, RSVP",
		description:
			"Describe your day and rwaft's AI builds a wedding website with your story, the schedule, the venue and an RSVP link, hosted at its own address.",
		heading: "AI wedding website builder",
		lead: "Tell rwaft your names, the date and what guests need to know. It builds a wedding site with the schedule, the venue and the details, and gives you a link to send with the invitations.",
		examples: [
			"A wedding website for Priya and Sam with our story, the schedule, the venue and an RSVP link",
			"A save-the-date page with a countdown to our wedding on 14 June",
			"A wedding site with travel and hotel tips for guests coming from abroad",
		],
		include: [
			"Your names, the date and the venue's address",
			"The schedule: ceremony, dinner, party",
			"The link to your RSVP form",
			"Anything guests ask about: dress code, travel, hotels, gifts",
			"The style: romantic, modern, rustic, black tie",
		],
		get: [
			{ title: "Everything guests ask, in one place", body: "Schedule, venue, directions and the details, so you answer each question once." },
			{ title: "A countdown, if you ask", body: "Count down to the day on the first screen." },
			{ title: "A link for the invitations", body: "Share it by message, email or a QR code on the card." },
		],
		note: "rwaft sites have no database, so they can't store RSVPs themselves. Make the RSVP form in a service like Google Forms or Tally and give rwaft the link. Every rwaft site is public to anyone with its link, so leave out anything you wouldn't want shared.",
		faq: [
			{
				question: "How do guests RSVP?",
				answer: "Through a form you link to. Make one in a form service, put its link in your prompt, and rwaft adds an RSVP button that opens it.",
			},
			{
				question: "Is my wedding website private?",
				answer: "No. Anyone with the link can open it, so share it only with guests and leave out anything you wouldn't want public.",
			},
		],
		share: ["Your wedding site,", "before the invites."],
	},
	{
		slug: "event-page",
		name: "Event page",
		blurb: "A page for a party, meetup or launch, with the when, where and a sign-up link.",
		title: "AI event page generator: parties, meetups, launches",
		description:
			"Describe your event and rwaft's AI builds a page with the date, place, agenda and a sign-up link, hosted at its own address in minutes.",
		heading: "AI event page generator",
		lead: "A birthday, a meetup, a launch night: give rwaft the when, the where and what's happening, and it builds a page you can share in the group chat the same afternoon.",
		examples: [
			"An RSVP page for a 30th birthday party on a rooftop, with a countdown and an RSVP link",
			"A page for a monthly JavaScript meetup with the agenda, speakers and the venue",
			"A one-page site for a charity fun run with the route, the schedule and how to sign up",
		],
		include: [
			"What, when and where, including the time zone if guests travel",
			"The agenda or line-up",
			"Your sign-up, ticket or RSVP link",
			"What people should bring or know",
		],
		get: [
			{ title: "The essentials up front", body: "Date, time, place and the sign-up button on the first screen." },
			{ title: "Agenda and speakers", body: "A timetable and a section for each speaker or act, if you list them." },
			{ title: "Quick to update", body: "Venue changed? Send a message and rwaft publishes the new version." },
		],
		note: "Tickets and sign-ups happen through a link to a service you already use; rwaft sites can't store them. An updated page goes live at a new link, so share the latest one.",
		faq: [
			{
				question: "Can people buy tickets on the page?",
				answer: "Not on the page itself. Link to your ticketing or sign-up page and rwaft puts the button where people look first.",
			},
			{
				question: "How fast can I have it?",
				answer: "A build takes a few minutes once it starts. If others are ahead of you, you see your place in line.",
			},
		],
		share: ["Your event page,", "shared today."],
	},
	{
		slug: "personal-website",
		name: "Personal website & link in bio",
		blurb: "A homepage or link-in-bio page with your bio, your work and your links.",
		title: "AI personal website and link-in-bio builder",
		description:
			"Describe yourself and rwaft's AI builds a personal website or link-in-bio page with your bio, your work and your links, hosted at its own address.",
		heading: "AI personal website and link-in-bio builder",
		lead: "A home on the web that's yours: a short bio, what you're working on and where to find you. Describe it, and rwaft builds and hosts it at its own link.",
		examples: [
			"A link-in-bio page for a musician with my latest release, tour dates and socials",
			"A personal homepage with a short bio, my writing and how to contact me",
			"A digital business card with my name, role, phone, email and LinkedIn",
		],
		include: [
			"Your name and a sentence about you",
			"The links you want, in order",
			"Anything to feature: a release, an article, a project",
			"The vibe: clean, bold, retro, dark",
		],
		get: [
			{ title: "Your links, your design", body: "Not a template everyone else uses: a page designed around how you describe yourself." },
			{ title: "Fast to open", body: "A small static site that loads quickly on a phone, where most bio links are tapped." },
			{ title: "Change it any time", body: "New release or new job? Send a message and rwaft publishes the new version." },
		],
		note: "An edit publishes at a new link, so update the link in your bio when you change the page.",
		faq: [
			{
				question: "Is this like Linktree?",
				answer: "It does the same job, a page of your links, but rwaft writes a site designed for you instead of filling in a fixed template.",
			},
			{
				question: "Do I need to know HTML?",
				answer: "No. Describe what you want in plain words. rwaft writes the code and explains each step as it builds.",
			},
		],
		share: ["Your corner", "of the web."],
	},
	{
		slug: "web-app",
		name: "Web app & tool",
		blurb: "Trackers, calculators, timers and other single-screen tools.",
		title: "AI web app generator: trackers, tools, calculators",
		description:
			"Describe a tool and rwaft's AI builds it as a working React web app: habit trackers, calculators, timers, planners. Hosted at its own link.",
		heading: "AI web app generator for everyday tools",
		lead: "Habit trackers, to-do lists, calculators, timers: describe how it should work and rwaft writes it as a real React app, checks that it builds, and hosts it at its own link.",
		examples: [
			"A habit tracker with streaks that remembers my progress in this browser",
			"A calculator that splits a restaurant bill with tip between friends",
			"A pomodoro timer with a task list and a sound when time's up",
		],
		include: [
			"What it does, step by step, like you'd explain it to a friend",
			"What it should remember between visits",
			"The rules: limits, totals, what happens when something runs out",
			"How it should look and feel",
		],
		get: [
			{ title: "A working app, not a mock-up", body: "Real buttons, real logic and real state, written in React and TypeScript." },
			{ title: "Full-screen when it should be", body: "A single tool gets the whole screen, without a website's header and footer." },
			{ title: "Built until it passes", body: "If the build breaks, rwaft reads the error and fixes the file, and you watch it happen." },
		],
		note: "There are no accounts or servers behind rwaft apps. Ask for data to be saved in the browser and it stays on that device; it won't sync between phones or people.",
		faq: [
			{
				question: "Can my app save data?",
				answer: "In the browser, yes: ask for it to remember things and it keeps them on that device. There's no database, so data isn't shared between devices or people.",
			},
			{
				question: "Can it have logins or payments?",
				answer: "Not yet. rwaft builds front-end apps without a back end.",
			},
		],
		share: ["Describe a tool.", "Use it today."],
	},
	{
		slug: "browser-game",
		name: "Browser game",
		blurb: "Arcade, puzzle and word games that run in any browser.",
		title: "AI game generator: make a browser game from a prompt",
		description:
			"Describe a game and rwaft's AI writes it, builds it and hosts it at its own link. Arcade, puzzle and word games that run in any browser, no code needed.",
		heading: "AI game generator for browser games",
		lead: "Describe the game: the goal, the controls and what makes it hard. rwaft writes the rules and the screens, builds it, and gives you a link your friends can play.",
		examples: [
			"A snake game with a high score and a speed-up every five apples",
			"A memory game with emoji pairs, a move counter and a timer",
			"A typing speed game with a 60-second round and words per minute at the end",
		],
		include: [
			"The goal, and how you win or lose",
			"The controls: keyboard, mouse, tap or swipe",
			"What changes as it gets harder",
			"The screens: start, playing, game over",
			"The style: retro pixels, neon, clean and flat",
		],
		get: [
			{ title: "The whole screen", body: "Games get a full-screen layout with no website header or footer." },
			{ title: "Start, play, game over", body: "rwaft plans each screen and state before it writes the game." },
			{ title: "A link to challenge friends", body: "Anyone with the link can play it in their browser; nothing to install." },
		],
		note: "rwaft makes single-player 2D games that run in the browser. Online multiplayer and shared leaderboards need a server, which rwaft apps don't have; a best score can be saved in the player's own browser.",
		faq: [
			{
				question: "Can I play on my phone?",
				answer: "Yes, if you ask for touch controls. Say “works with taps and swipes on a phone” in your prompt.",
			},
			{
				question: "Can I make it harder or add levels later?",
				answer: "Yes. Send a follow-up like “add a level every 100 points” and rwaft publishes the new version.",
			},
		],
		share: ["Describe a game.", "Play it in minutes."],
	},
	{
		slug: "resume-website",
		name: "Resume website",
		blurb: "Your CV as a website: experience, skills and a way to reach you, at one link.",
		title: "AI resume website builder: your CV at its own link",
		description:
			"Describe your experience and rwaft's AI turns your CV into a clean resume website, hosted at its own link for applications, email signatures and LinkedIn.",
		heading: "AI resume website builder",
		lead: "Paste your CV or describe your experience, and rwaft turns it into a resume site that reads well on any screen, at a link you can put on every application.",
		examples: [
			"A resume website for a junior data analyst with experience, skills, education and a contact section",
			"A one-page CV for a nurse moving abroad, with certifications, languages and references available on request",
			"A resume site for a product manager with a short summary, a timeline of roles and selected results",
		],
		include: [
			"Your name, the role you're aiming for and a one-line summary",
			"Your experience, newest first, with dates and what you achieved",
			"Skills, education, certifications and languages",
			"How to reach you: email, LinkedIn, GitHub or a portfolio",
			"The tone: plain and professional, modern, a little bold",
		],
		get: [
			{ title: "A layout recruiters can scan", body: "Your summary first, then experience, skills and education in the order people look for them." },
			{ title: "Readable on a phone", body: "Links usually get opened on a phone first, and every page rwaft writes is mobile-first." },
			{ title: "Up to date in one message", body: "New role or new skill? Send it as a follow-up and rwaft publishes the new version." },
		],
		note: "Your resume site is public to anyone with its link, so leave out your home address, your phone number and anything else you wouldn't post online. If you also keep a PDF of your CV online, include its link and rwaft adds a download button.",
		faq: [
			{
				question: "Is a resume website better than a PDF?",
				answer: "They do different jobs. A PDF is what most application forms ask for; a resume website is a link for your email signature, your LinkedIn profile or a message, and it opens properly on a phone. Many people use both.",
			},
			{
				question: "Can I include a photo?",
				answer: "Yes, if it's online already: put the image link in your prompt. You can't upload files to rwaft yet.",
			},
		],
		share: ["Your resume,", "as a website."],
	},
	{
		slug: "real-estate-website",
		name: "Real estate website",
		blurb: "Listings, an agent profile and a way to book a viewing, for agents and landlords.",
		title: "AI real estate website builder for agents",
		description:
			"Describe your listings and rwaft's AI builds a real estate website with property cards, an agent profile and contact buttons, hosted at its own link.",
		heading: "AI real estate website builder",
		lead: "Tell rwaft about the properties you have and the area you know. It builds a site with a card for each listing, a page about you and a clear way to book a viewing, hosted at its own link.",
		examples: [
			"A website for a real estate agent in Lisbon with five featured apartments, an about page and a contact section",
			"A single-property page for a three-bedroom house for sale, with photos, features, the price and a button to book a viewing",
			"A site for a small holiday rental with two cottages, what's nearby and a link to our booking page",
		],
		include: [
			"Each property: price, size, bedrooms, location and a line about it",
			"Links to photos you already have online",
			"Who you are and the area you cover",
			"How to book a viewing: phone, email, WhatsApp or a booking link",
			"The feel: premium, friendly, modern",
		],
		get: [
			{ title: "Listings as cards", body: "Each property with its key facts at a glance, and a section or page of its own if you ask." },
			{ title: "Filters, if you want them", body: "Ask for a filter by price or bedrooms and rwaft writes it into the page, working on the listings in your prompt." },
			{ title: "A link for every channel", body: "Share it on property portals, on social media or on a sign in the window." },
		],
		note: "rwaft sites don't connect to listing feeds or an MLS, and they can't store enquiries. Listings come from your prompt and change by follow-up message; enquiries go to your phone, your email or a form you already use.",
		faq: [
			{
				question: "Can listings update automatically?",
				answer: "No. rwaft sites have no database or feed, so you add or remove a property by sending a follow-up message, and rwaft publishes the new version.",
			},
			{
				question: "Can buyers book a viewing on the site?",
				answer: "Through a link: give rwaft your calendar booking page, WhatsApp number or email and it adds the buttons.",
			},
		],
		share: ["Your listings,", "live in minutes."],
	},
	{
		slug: "fitness-website",
		name: "Fitness & personal trainer website",
		blurb: "Classes, coaching packages and a way to book, for trainers, gyms and studios.",
		title: "AI website builder for personal trainers and gyms",
		description:
			"Describe your coaching or classes and rwaft's AI builds a fitness website with packages, a timetable and a booking link, hosted at its own link.",
		heading: "AI website builder for personal trainers and gyms",
		lead: "Say what you coach, who you train and how people sign up. rwaft builds a site with your packages, your timetable and a big button to book, hosted at a link for your Instagram bio.",
		examples: [
			"A website for a personal trainer with three coaching packages, the goals I help clients with and a booking link",
			"A site for a boxing gym with the weekly class timetable, coaches, prices and a free trial button",
			"A landing page for an online running coach with a 12-week plan, what's included and a link to apply",
		],
		include: [
			"What you offer: sessions, classes, programs or online coaching",
			"Prices or packages, if you share them",
			"Your timetable and where you train",
			"How to book or sign up: a booking app, WhatsApp or a form link",
			"The energy: calm and clean, bold and loud, premium",
		],
		get: [
			{ title: "Packages side by side", body: "Each offer with what's included and its price, so people can pick one." },
			{ title: "A timetable that fits a phone", body: "Classes by day, readable without zooming." },
			{ title: "Booking where it counts", body: "The booking link you give it on the first screen and after every section." },
		],
		note: "rwaft sites don't take bookings or payments themselves. Link to the booking or payment tool you already use, like your class app, Calendly or a Stripe payment link, and put it in your prompt.",
		faq: [
			{
				question: "Can clients book and pay on the site?",
				answer: "Through a link to a service you already use. rwaft sites have no back end, so they can't take payments or store bookings.",
			},
			{
				question: "Can I add a workout timer or calculator?",
				answer: "Yes. rwaft builds small tools too, like an interval timer or a calorie calculator, and they run right in the browser.",
			},
		],
		share: ["Your coaching,", "online today."],
	},
	{
		slug: "nonprofit-website",
		name: "Nonprofit & charity website",
		blurb: "Your cause, your work and a clear way to donate or volunteer.",
		title: "AI website builder for nonprofits and charities",
		description:
			"Describe your cause and rwaft's AI builds a nonprofit website with your mission, programs and donate and volunteer buttons, hosted at its own link.",
		heading: "AI website builder for nonprofits and charities",
		lead: "Tell rwaft what your organization does, who it helps and how people can support it. It builds a site that explains the cause in plain words and sends visitors to donate or volunteer.",
		examples: [
			"A website for a dog rescue charity with dogs for adoption, how to volunteer and a donate button",
			"A site for a community food bank with opening times, what we need this month and how to give",
			"A one-page site for a school fundraiser with the goal, what the money is for and a link to donate",
		],
		include: [
			"Your mission in one or two sentences",
			"Your programs or what you do, with real numbers only if you have them",
			"How people can help: donate, volunteer, attend, share",
			"Links to your donation page and volunteer form",
			"Contact details and, if you have one, your registration number",
		],
		get: [
			{ title: "The cause, clearly", body: "A first screen that says what you do and why it matters, with the main way to help right there." },
			{ title: "Ways to help", body: "Donate, volunteer and spread-the-word sections, each with its own button." },
			{ title: "Easy to keep current", body: "New appeal or new event? One message updates the site." },
		],
		note: "rwaft sites can't process donations or store sign-ups. Point the buttons at the donation platform and forms you already use, and rwaft puts them where visitors look first.",
		faq: [
			{
				question: "Can people donate on the site?",
				answer: "Through a link to the platform you already use, like your payment provider's donation page. rwaft sites have no back end and can't take payments.",
			},
			{
				question: "Can volunteers sign up through the site?",
				answer: "Through a form you already use, like Google Forms or Tally. Give rwaft the link and it adds a volunteer button.",
			},
		],
		share: ["Your cause,", "online in minutes."],
	},
	{
		slug: "church-website",
		name: "Church website",
		blurb: "Service times, events and how to visit, for churches and faith communities.",
		title: "AI church website builder: services, events, visit",
		description:
			"Describe your church and rwaft's AI builds a website with service times, events, ministries and directions, hosted at its own link. No code needed.",
		heading: "AI church website builder",
		lead: "Give rwaft your service times, what's on and how newcomers find you. It builds a welcoming site with the details people look for first, at a link for your bulletin, signs and social pages.",
		examples: [
			"A website for a small church with Sunday service times, a welcome for first-time visitors, ministries and directions",
			"A site for a youth group with weekly meetings, upcoming events and how parents can get in touch",
			"A page for a church's Christmas services with times, places and a link to watch online",
		],
		include: [
			"Service times and your address",
			"A short welcome for first-time visitors",
			"Ministries, groups and regular events",
			"Links to your livestream, sermons, giving page or newsletter",
			"Contact details for the office or the pastor",
		],
		get: [
			{ title: "Times and directions up front", body: "When and where, on the first screen, with a link that opens in maps." },
			{ title: "A page for each part of church life", body: "Ministries, groups and events, on up to five pages that share one design." },
			{ title: "Notices in a sentence", body: "Holiday service times changed? Send a message and rwaft publishes the update." },
		],
		note: "rwaft sites don't host video, take donations or store prayer requests. Link to your livestream, your giving platform and your forms, and rwaft adds a clear button for each.",
		faq: [
			{
				question: "Can we stream services on the site?",
				answer: "Link to your stream where it's already hosted, like YouTube or Facebook, and rwaft adds a watch button. rwaft sites don't host video themselves.",
			},
			{
				question: "Can people give online?",
				answer: "Through a link to the giving platform you already use. rwaft sites can't take payments themselves.",
			},
		],
		share: ["Your church,", "easy to find."],
	},
	{
		slug: "musician-website",
		name: "Musician & band website",
		blurb: "Releases, tour dates and links to listen, for artists, bands and DJs.",
		title: "AI musician website builder for artists and bands",
		description:
			"Describe your music and rwaft's AI builds an artist website with releases, tour dates, links to listen and a booking contact, hosted at its own link.",
		heading: "AI website builder for musicians and bands",
		lead: "Tell rwaft about your sound, your releases and where you're playing. It builds an artist site with links to every platform you're on, a page for shows and a contact for bookings.",
		examples: [
			"A website for an indie band with our latest album, tour dates, a gallery and links to Spotify and Bandcamp",
			"An artist page for a wedding DJ with the music I play, packages and a booking contact",
			"A one-page press kit for a jazz singer with a bio, press quotes, videos and a booking email",
		],
		include: [
			"Your name, your genre and a short bio",
			"Releases, with links to Spotify, Apple Music, Bandcamp or YouTube",
			"Upcoming shows with dates, venues and ticket links",
			"Real press quotes only, word for word",
			"The look: dark and moody, bright, retro, minimal",
		],
		get: [
			{ title: "Every place to listen", body: "Big, clear links to each platform, so fans land where they already listen." },
			{ title: "Tour dates that read well", body: "Dates, cities and venues in a list, with a ticket button on each." },
			{ title: "A press kit in a link", body: "Bio, photos and contact on one page, ready to send to promoters." },
		],
		note: "rwaft sites don't sell tickets or merch, and can't host audio files. Link to your ticketing, store and streaming pages, and rwaft adds a button for each.",
		faq: [
			{
				question: "Can I add a music player?",
				answer: "Ask for one with the link to your track on Spotify, SoundCloud or YouTube, and rwaft can embed their player. It can't host audio files itself.",
			},
			{
				question: "How do I update tour dates?",
				answer: "Send the new dates as a follow-up. rwaft publishes the new version at a new link, so update the link in your bio. A build's code is kept for a day; after that, describe the whole site again.",
			},
		],
		share: ["Your music,", "one link away."],
	},
	{
		slug: "birthday-website",
		name: "Birthday page",
		blurb: "A surprise page for someone's birthday, with messages, memories and a countdown.",
		title: "AI birthday website maker for a surprise page",
		description:
			"Describe the person and rwaft's AI builds a birthday website with your messages, memories, photos and a countdown, at a link you can send on the day.",
		heading: "AI birthday website maker",
		lead: "Tell rwaft who it's for and what makes them them. It builds a page with your messages, the memories you share and a little surprise, at a link to send at midnight.",
		examples: [
			"A birthday page for my girlfriend with a countdown, 10 reasons I love her and a timeline of our year",
			"A birthday site for my dad's 60th with a message from each of us and a quiz about his life",
			"A surprise page for my best friend with our inside jokes, a playlist link and confetti when it opens",
		],
		include: [
			"Who it's for, and their name as you'd say it",
			"The messages, memories and inside jokes to include",
			"Links to photos you already have online",
			"Any surprise: a countdown, confetti, a quiz, a hidden message",
			"Their favourite colours, or the mood: sweet, funny, elegant",
		],
		get: [
			{ title: "Made for one person", body: "Not a card template: a page built around the details you give it." },
			{ title: "Little surprises", body: "Countdowns, animations, quizzes or a button that reveals a message, written as working code." },
			{ title: "A link to send", body: "Send it by message at midnight, or put it in a QR code on the card." },
		],
		note: "Anyone with the link can open the page, so keep it to what you'd be happy for them to show others. You can't upload photos to rwaft yet: use links to images that are already online, or leave the photos out.",
		faq: [
			{
				question: "Can I add our photos?",
				answer: "Yes, if they're online already: put the image links in your prompt. You can't upload files to rwaft yet.",
			},
			{
				question: "Can it stay a surprise until the day?",
				answer: "Ask for a countdown that reveals the page at midnight on the day. The page is public to anyone with the link, so just don't send it early.",
			},
		],
		share: ["A birthday surprise,", "at its own link."],
	},
	{
		slug: "quiz-maker",
		name: "Quiz",
		blurb: "A quiz with questions, scoring and a result at the end, to share or to study with.",
		title: "AI quiz maker: build an interactive quiz online",
		description:
			"Describe your questions and rwaft's AI builds an interactive quiz with scoring and results, hosted at its own link for friends, students or followers.",
		heading: "AI quiz maker",
		lead: "Give rwaft your topic or your questions, and how it should score. It builds a quiz that plays in the browser, with a result at the end and a link anyone can open.",
		examples: [
			"A 10-question quiz about the solar system for a year 6 class, with an explanation after each answer",
			"A personality quiz: which coffee are you? Eight questions, four results, each with a short description",
			"A flashcard quiz for learning Spanish verbs, with a score and a button to retry the ones I missed",
		],
		include: [
			"The topic, or the exact questions and answers",
			"The kind: right or wrong answers, a personality result, or flashcards",
			"How many questions, and whether to explain each answer",
			"What happens at the end: a score, a result, a retry button",
			"Who it's for, and the look: playful, clean, classroom",
		],
		get: [
			{ title: "It plays, not just reads", body: "Questions one at a time, answers that respond, and a score kept as you go." },
			{ title: "A result at the end", body: "A score, a grade or a personality result, with a button to try again." },
			{ title: "Your questions, or its own", body: "Give it exact questions, or a topic and it writes them, for you to check before you share." },
		],
		note: "Scores stay on each player's device: rwaft quizzes have no server, so there's no shared leaderboard and no way to collect answers. If you need answers collected, use a form tool and link to it.",
		faq: [
			{
				question: "Can I see everyone's scores?",
				answer: "No. rwaft apps have no back end, so a score stays in the player's browser. For collected results, use a form or quiz service that stores answers.",
			},
			{
				question: "Can I use it in class?",
				answer: "Yes. Share the link and students open it in any browser, on a phone or a laptop, with nothing to install or sign up for.",
			},
		],
		share: ["Your quiz,", "ready to play."],
	},
	{
		slug: "school-project-website",
		name: "School project website",
		blurb: "A website for a class project or presentation, with sections, sources and extras.",
		title: "Make a school project website with AI",
		description:
			"Describe your topic and rwaft's AI builds a website for your school project, with sections, a timeline, a quiz and your sources, hosted at its own link.",
		heading: "AI website maker for school projects",
		lead: "Tell rwaft your topic and what the project needs to cover. It builds a clear, good-looking site with a section for each part, which you can present in class or hand in as a link.",
		examples: [
			"A school project website about the water cycle with each stage explained and a short quiz at the end",
			"A history project site about the Roman Empire with a timeline, key people and a sources page",
			"A science fair page for my experiment: question, hypothesis, method, results and conclusion",
		],
		include: [
			"The topic, and your class or level",
			"The sections your teacher asked for",
			"Your own facts, findings and words, as much as you can",
			"Your sources, so rwaft can list them",
			"Anything interactive: a timeline, a quiz, flip cards",
		],
		get: [
			{ title: "A section for each part", body: "Laid out in the order your project needs, with headings that make it easy to present." },
			{ title: "Interactive extras", body: "Timelines, quizzes and flip cards, written as part of the site." },
			{ title: "A link to hand in", body: "Open it on the classroom screen or send the link to your teacher." },
		],
		note: "Check your school's rules on using AI before you start, and check every fact rwaft writes against your sources. The site is public to anyone with the link, so leave out your full name and your school if you'd rather not share them.",
		faq: [
			{
				question: "Will the facts be correct?",
				answer: "Not guaranteed. AI can get facts wrong, so give rwaft your own research and check everything it writes before you hand it in.",
			},
			{
				question: "Can I present it in class?",
				answer: "Yes. It opens in any browser, so you can show it on the classroom screen or a laptop.",
			},
		],
		share: ["Your school project,", "as a website."],
	},
	{
		slug: "clinic-website",
		name: "Clinic & therapist website",
		blurb: "Services, practitioners and how to book, for clinics, therapists and dentists.",
		title: "AI website builder for clinics and therapists",
		description:
			"Describe your practice and rwaft's AI builds a website with your services, team, opening hours and booking link, hosted at its own link. No code needed.",
		heading: "AI website builder for clinics and therapists",
		lead: "Tell rwaft about your practice, the people in it and how patients book. It builds a calm, clear site with the details patients look for, at a link for your Google listing and referrals.",
		examples: [
			"A website for a physiotherapy clinic with treatments, our three physios, prices and a booking link",
			"A site for a counsellor with what I help with, how sessions work, fees and how to get in touch",
			"A website for a family dental practice with services, opening hours, an emergency number and directions",
		],
		include: [
			"Your services or treatments, with prices if you share them",
			"The practitioners and their qualifications",
			"Opening hours, your address, and parking or access",
			"How to book: your booking system's link, a phone number or an email",
			"The feel: calm, warm, clinical, modern",
		],
		get: [
			{ title: "What patients look for", body: "Services, who they'll see, what it costs and how to book, without hunting." },
			{ title: "Booking on every page", body: "Your booking link or phone number wherever people are ready to act." },
			{ title: "Easy to update", body: "New hours or a new practitioner? One message and rwaft publishes the new version." },
		],
		note: "rwaft sites have no back end and every site is public, so never collect patient information through one. Send bookings and intake forms to the secure system you already use, and put its link in your prompt.",
		faq: [
			{
				question: "Can patients fill in forms on the site?",
				answer: "Not on the site itself: rwaft sites can't store what visitors type, and patient details belong in a secure system. Link to the booking or intake system you already use.",
			},
			{
				question: "Will it show on Google Maps?",
				answer: "Your Google Business Profile is what shows on Maps. Add the site's link to it, so people can go from the listing to your services.",
			},
		],
		share: ["Your practice,", "online today."],
	},
	{
		slug: "react-app",
		name: "React app",
		blurb: "A typed React + Vite + Tailwind codebase, generated, built and hosted.",
		title: "AI React app generator: TypeScript, Vite, Tailwind",
		description:
			"Generate a React app from a prompt: TypeScript on Vite, Tailwind CSS and React Router, checked until the build passes and hosted at its own link.",
		heading: "AI React app generator",
		lead: "For when you care what's under the hood. rwaft generates a typed React app on the stack you'd pick yourself, streams the real install and build output, and repairs what breaks.",
		examples: [
			"A Kanban board with drag and drop, three columns and cards saved to localStorage",
			"A dashboard with a sidebar, charts over sample data and a settings page",
			"A recipe finder with search and filters over a built-in list of 30 recipes",
		],
		include: [
			"The screens and the routes between them",
			"The data model, and where sample data should come from",
			"Behaviour in detail: filters, sorting, empty and error states",
			"Any library you want, by name",
		],
		get: [
			{ title: "A stack you'd choose", body: "React and TypeScript on Vite, Tailwind CSS v4 with design tokens, and React Router for more than one page." },
			{ title: "A design system first", body: "rwaft writes the palette, fonts and a small component kit before the pages, so every screen shares them." },
			{ title: "The real build log", body: "npm installs, the checks and Vite's output stream live; a failing file is sent back for a targeted fix." },
		],
		note: "Generated apps are front-end only: no server code, database or environment secrets. Call public APIs from the browser, or keep data in localStorage.",
		faq: [
			{
				question: "Is the code any good?",
				answer: "Every file is parsed before the build, the TypeScript compiler checks for names that don't exist, and the Vite build has to pass before the site goes live. Pages share one set of design tokens and components rather than one-off styles.",
			},
			{
				question: "Can I deploy a React app I already have?",
				answer: "Yes. Paste a public GitHub, GitLab or Bitbucket repository that uses Vite or Create React App and rwaft builds and hosts it.",
			},
		],
		share: ["A real React app,", "from one prompt."],
	},
	{
		slug: "deploy-react-app",
		name: "Deploy a React repo",
		blurb: "Host a public Vite or Create React App repository at its own link.",
		title: "Deploy a React app from GitHub: Vite and CRA",
		description:
			"Paste a public GitHub, GitLab or Bitbucket repo that uses Vite or Create React App. rwaft installs it, builds it and hosts it at its own link.",
		heading: "Deploy a React app from GitHub",
		lead: "Already have a React app? Paste its public repository and rwaft clones it, installs it, builds it and hosts the result at its own link, with the full build log in front of you.",
		examples: [],
		include: [
			"A public repository on GitHub, GitLab or Bitbucket",
			"A Vite or Create React App project with a build script",
			"Its lockfile committed, so installs match yours",
		],
		get: [
			{ title: "Install and build, in the open", body: "Every line of npm install and the build streams live, so a failure shows exactly where it broke." },
			{ title: "Create React App that still builds", body: "rwaft patches common CRA build blockers on newer Node versions, like Terser worker crashes and lint errors that fail the build." },
			{ title: "Hosted at its own link", body: "The built files are served from their own address, with client-side routes falling back to your app." },
		],
		note: "Only public repositories, and only Vite or Create React App for now: Next.js, Remix and server code aren't supported, and there's no way to set environment variables yet.",
		faq: [
			{
				question: "Does it support private repositories?",
				answer: "Not yet. The repository has to be public.",
			},
			{
				question: "Can I deploy a Lovable or Bolt project?",
				answer: "If it's a Vite React app in a public repository, yes. Parts that rely on their hosted back end or secret keys won't work without it.",
			},
		],
		share: ["Paste a repo.", "Get a live link."],
		mode: "deploy",
	},
]

export const findUseCase = (slug: string) => USE_CASES.find((item) => item.slug === slug)

/** Where a use case's examples open the console: in the box, ready to send. */
export const consoleHref = (example?: string, mode: UseCase["mode"] = "prompt") =>
	mode === "deploy" ? "/#deploy" : example ? `/#prompt=${encodeURIComponent(example)}` : "/"
