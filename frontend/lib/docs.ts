import type { Article } from "./articles"
import { chatsFor, weeklyPhrase, type Pricing } from "./pricing"
import { USE_CASES } from "./useCases"

/**
 * /docs: how to use rwaft, from a first build to its limits. Built from the
 * API's live pricing like /pricing, so a cost or a feature can't be quoted
 * after it changes, and the GitHub page only exists while pushing works.
 *
 * Facts come from the pipeline itself: up to five pages (PLAN_MAX_PAGES),
 * source kept for a day, repo deploys needing a root package.json with a
 * `build` script and installed with npm, one build at a time in a shared line.
 */

/** Every docs path that can exist, for static params and the 404 boundary. */
export const DOC_SLUGS = [
	"getting-started",
	"writing-prompts",
	"editing",
	"sharing",
	"credits",
	"deploy-a-repo",
	"push-to-github",
	"limits",
] as const

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

export function docsFor(pricing: Pricing): Article[] {
	const { billing } = pricing
	const chat = plural(pricing.costs.prompt, "credit")
	const deploy = plural(pricing.costs.deploy, "credit")
	const freeChats = chatsFor(pricing.signupTokens, pricing)

	const docs: Article[] = [
		{
			slug: "getting-started",
			name: "Getting started",
			title: "Getting started: build your first site with rwaft",
			description:
				"Build your first website or app with rwaft: describe it, watch the real build, and share the live link. A step-by-step guide for first-timers.",
			heading: "Getting started",
			lead: "From an idea to a live link in a few minutes. Here's your first build, step by step.",
			sections: [
				{
					heading: "Before you start",
					body: [
						billing
							? `You need a Google account to build. New accounts get ${plural(pricing.signupTokens, "free credit")}${freeChats ? `, which is ${plural(freeChats, "chat")}` : ""}, so you can try rwaft before paying anything.${weeklyPhrase(pricing) ? ` After that, a balance that has run low is ${weeklyPhrase(pricing)}.` : ""}`
							: "You don't need an account: every build is free right now.",
						"Have a rough idea of what you want. A sentence is enough to start; more detail gets you closer on the first try.",
					],
				},
				{
					heading: "Your first build",
					body: [
						{
							steps: [
								"Open rwaft and type what you want in the box, the way you'd explain it to a friend.",
								billing ? `Check the cost shown before you send (${chat} a chat), then send it.` : "Send it.",
								"Watch rwaft plan the pages, write the app, install it and build it. Each step is explained in plain words, with the raw log one tap away.",
								"When the build passes, your site appears in the preview, at its own link.",
								"Open the link, try it on your phone, and send it to anyone.",
							],
						},
					],
				},
				{
					heading: "If others are building",
					body: [
						"Builds run one at a time. If someone else's is running, yours waits in a shared line, shows its place and starts on its own. You can close the tab: the link works once the site is live.",
					],
				},
				{
					heading: "If a build fails",
					body: [
						"rwaft reads build errors and fixes them itself, and you watch it happen. If a build still fails, try again, perhaps with a simpler description.",
						...(billing ? ["A failed build's credits come back automatically."] : []),
						{ link: { text: "Next:", href: "/docs/writing-prompts", label: "how to write a good prompt" } },
					],
				},
			],
			share: ["Your first site,", "step by step."],
		},
		{
			slug: "writing-prompts",
			name: "Writing a good prompt",
			title: "How to write a prompt for an AI website builder",
			description:
				"What to put in a prompt so rwaft builds the site you pictured: what it is, who it's for, the pages, the content and the look, with examples.",
			heading: "Writing a good prompt",
			lead: "The AI builds what you describe, so the clearer the description, the closer the first version. You don't need technical words, just the right details.",
			sections: [
				{
					heading: "The five things to say",
					body: [
						{
							list: [
								"What it is: a landing page, a portfolio, a menu, a game",
								"Who it's for, and what they should do there",
								"The pages or sections you want. rwaft makes up to five pages, sharing one design",
								"The real content: names, prices, hours and wording. Anything you leave out comes back as placeholder text",
								"The look: a mood, a few colours, or a site you like",
							],
						},
					],
				},
				{
					heading: "A vague prompt, and a better one",
					body: [
						"Vague: “a website for my bakery”. rwaft builds something, but it has to guess your menu, your hours and your style.",
						"Better: “A website for Rosa's Bakery in Porto: a home page with our story, a menu page with breads and cakes and their prices, and a contact page with our opening hours (Tuesday to Sunday, 7am to 2pm) and a map link. Warm and rustic, cream and brown.”",
					],
				},
				{
					heading: "Images and links",
					body: [
						"You can't upload files yet. If your images are online already, put their links in the prompt and rwaft uses them; otherwise it leaves placeholders.",
						"Buttons can point anywhere: a booking page, a form, a payment link or your social profiles. Give rwaft the links and say what each button should do.",
					],
				},
				{
					heading: "What to leave out",
					body: [
						{
							list: [
								"Anything private: every site is public to anyone with its link",
								"Logins, databases and payments: rwaft sites run in the browser, so link to a service that handles those",
								"Made-up reviews or figures: if you want testimonials, give rwaft real ones, word for word",
							],
						},
					],
				},
				{
					heading: "Prompts to start from",
					body: [
						{ prompts: USE_CASES.flatMap((item) => item.examples.slice(0, 1)).slice(0, 6) },
						{ link: { text: "Forty more in", href: "/guides/ai-website-prompts", label: "the prompt guide" } },
					],
				},
			],
			share: ["Better prompts,", "better sites."],
		},
		{
			slug: "editing",
			name: "Changing your site",
			title: "Edit your site by chat: follow-up messages",
			description:
				"Change a site rwaft built by sending a follow-up message: what you can ask for, how new versions and links work, and how long changes stay possible.",
			heading: "Changing your site",
			lead: "You don't edit code or drag boxes around: you say what to change, in the same chat, and rwaft builds the new version.",
			sections: [
				{
					heading: "Send a follow-up",
					body: [
						"In the chat where the site was built, describe the change: “make the header darker”, “add a contact page”, “change the latte to $4”.",
						billing
							? `Each follow-up is a complete build and costs the same as the first, ${chat}, however big the change.`
							: "Each follow-up is a complete build.",
						"rwaft remembers what you asked for before, so you only describe what's different.",
					],
				},
				{
					heading: "Every version gets a new link",
					body: [
						"A change publishes the new version at a new link. Share the latest one, and update it anywhere you've posted it, like your bio or a QR code.",
					],
				},
				{
					heading: "Changes work for a day",
					body: [
						"rwaft keeps a site's code for a day after each build, and follow-ups edit it within that time. After that, describe the whole site again and rwaft builds it fresh.",
						...(pricing.github
							? [{ link: { text: "To keep the code for good,", href: "/docs/push-to-github", label: "push it to GitHub" } }]
							: []),
					],
				},
				{
					heading: "Tips",
					body: [
						{
							list: [
								"One or two changes per message are easier to check than ten",
								"Say where: “the button in the first section”, not just “the button”",
								"If a change isn't right, describe what you want instead; there's nothing to undo first",
							],
						},
					],
				},
			],
			share: ["Change it", "by asking."],
		},
		{
			slug: "sharing",
			name: "Sharing your site",
			title: "Share your site: links, visibility and the badge",
			description:
				"How rwaft site links work: where your site lives, who can see it, the Made with rwaft badge, search engines, and what happens when you change it.",
			heading: "Sharing your site",
			lead: "Every site rwaft builds gets its own address the moment the build passes, ready to send to anyone.",
			sections: [
				{
					heading: "Your link",
					body: [
						"Each site lives at its own address, like abc12345.rwaft.live. Copy it from the preview, or open it in a new tab.",
						"Your recent builds are listed on the home screen of the device you built them on, so you can find them again.",
					],
				},
				{
					heading: "Who can see it",
					body: ["Anyone with the link. Every site is public, so don't put anything private in a prompt."],
				},
				{
					heading: "The “Made with rwaft” badge",
					body: ["Every hosted site shows a small “Made with rwaft” link in its bottom-right corner, which opens rwaft in a new tab."],
				},
				{
					heading: "Search engines",
					body: [
						"Your site is public, so search engines can find it, but rwaft doesn't submit it or promise a ranking. Linking to it from your social profiles, or your Google Business Profile if you're a local business, helps people find it.",
					],
				},
				{
					heading: "Domains and new versions",
					body: [
						"Custom domains aren't supported yet; each site lives at its own rwaft.live address.",
						"A follow-up publishes the new version at a new link, so update the link anywhere you've shared it.",
					],
				},
			],
			share: ["Your site,", "at its own link."],
		},
		{
			slug: "credits",
			name: "Credits and refunds",
			title: billing ? "Credits and refunds: how paying for rwaft works" : "Is rwaft free? How building costs work",
			description: billing
				? "How rwaft's credits work: free credits on sign-up, what a chat and a repo deploy cost, credit packs with no subscription, and refunds for failed builds."
				: "Every build on rwaft is free right now, and you don't need an account to start.",
			heading: billing ? "Credits and refunds" : "What building costs",
			lead: billing
				? "rwaft charges per build, not per month. You see what a build costs before you send it, and a build that fails costs nothing."
				: "Every build is free right now, and you don't need an account to start.",
			sections: billing
				? [
						{
							heading: "Free credits",
							body: [
								`Sign in with Google and you get ${plural(pricing.signupTokens, "free credit")}${freeChats ? `, which is ${plural(freeChats, "chat")}` : ""}.`,
								...(weeklyPhrase(pricing)
									? [`Once a week, if your balance is below ${plural(pricing.weeklyTokens, "credit")}, it is ${weeklyPhrase(pricing).replace(" every week", "")} for free. The week counts from your last top-up, and a bigger balance, such as bought credits, is never touched.`]
									: []),
							],
						},
						{
							heading: "What things cost",
							body: [
								{
									list: [
										`A chat, whether it's the first message or a follow-up: ${chat}, however big the change`,
										`Deploying a repository: ${deploy}`,
									],
								},
								"Your balance is in the header while you're signed in, and the cost of a build shows before you send it.",
							],
						},
						{
							heading: "Refunds",
							body: ["If a build fails, its credits are refunded automatically. You don't need to ask."],
						},
						{
							heading: "Buying more",
							body: [
								pricing.payments && pricing.packs.length > 0
									? "When you run out, buy a credit pack from the credits menu. There's no subscription, and the price you see is the price you pay. Payment is handled by Dodo Payments."
									: "Paid credit packs aren't on sale yet.",
								{ link: { text: "Every pack and price is on", href: "/pricing", label: "the pricing page" } },
							],
						},
					]
				: [
						{
							heading: "Free right now",
							body: ["There's nothing to buy and no account to make. Describe a site and send it.", { link: { text: "See", href: "/pricing", label: "pricing" } }],
						},
					],
			share: billing ? ["Pay per build,", "never per month."] : ["Every build,", "free right now."],
		},
		{
			slug: "deploy-a-repo",
			name: "Deploying a repository",
			title: "Deploying a repository: requirements and fixes",
			description:
				"What rwaft needs to deploy your repository: public, Vite or Create React App, a build script and a lockfile, plus what to do when a deploy fails.",
			heading: "Deploying a repository",
			lead: "Already have a React app? Paste its public repository and rwaft installs it, builds it and hosts it at its own link. Here's what it needs.",
			sections: [
				{
					heading: "How to deploy",
					body: [
						{
							steps: [
								"On the home screen, switch the box from “Describe an app” to “GitHub repo”.",
								"Paste the repository's URL from GitHub, GitLab or Bitbucket.",
								billing ? `Send it. A deploy costs ${deploy}, refunded if it fails.` : "Send it.",
								"Watch the install and the build stream live. The site goes live at its own link when the build passes.",
							],
						},
					],
				},
				{
					heading: "What the repository needs",
					body: [
						{
							list: [
								"To be public: private repositories aren't supported yet",
								"A Vite or Create React App project, with package.json at the repository's root",
								"A “build” script in package.json",
								"Ideally a committed package-lock.json: rwaft installs with npm, and the lockfile makes its install match yours",
							],
						},
					],
				},
				{
					heading: "What isn't supported",
					body: [
						{
							list: [
								"Next.js, Remix and other frameworks that need a server",
								"Server code and APIs",
								"Environment variables: there's no way to set them yet, so code that reads keys at build time won't get them",
							],
						},
					],
				},
				{
					heading: "Create React App",
					body: [
						"Many Create React App projects no longer build on current Node versions. rwaft patches the common blockers, like Terser worker crashes and lint warnings that fail the build.",
					],
				},
				{
					heading: "When a deploy fails",
					body: [
						"The log shows the line where it broke. The usual causes are a missing build script, package.json sitting in a subfolder, and code that expects environment variables.",
						...(billing ? ["A failed deploy's credits come back automatically."] : []),
						{ link: { text: "Moving an app from another builder?", href: "/guides/host-a-lovable-or-bolt-project", label: "Here's how" } },
					],
				},
			],
			share: ["Paste a repo.", "Get a live link."],
		},
		{
			slug: "push-to-github",
			name: "Pushing to GitHub",
			title: "Push your rwaft site's code to GitHub",
			description:
				"Send the React code rwaft wrote to a new public or private GitHub repository, so you can keep it, edit it yourself or host it anywhere.",
			heading: "Pushing your code to GitHub",
			lead: "Every site rwaft builds is a real React and TypeScript app. Push it to a repository on your GitHub account and the code is yours to keep, edit and host anywhere.",
			sections: [
				{
					heading: "How to push",
					body: [
						{
							steps: [
								"Open a finished build that you made from a prompt.",
								"Choose “Push code to GitHub”, name the repository, and tick “Private repository” if you don't want it public.",
								"Choose “Continue on GitHub” and approve access in the window that opens.",
								"rwaft creates the repository, pushes the code and links to it when it's done.",
							],
						},
					],
				},
				{
					heading: "What rwaft does with your access",
					body: ["GitHub asks you to approve access once. rwaft uses it for that one push and revokes it straight after."],
				},
				{
					heading: "When you can push",
					body: [
						"While rwaft still has the build's code: for a day after each build. After that the chat tells you it can no longer be pushed, and you'd describe the site again to get a new build to push.",
					],
				},
				{
					heading: "What's in the repository",
					body: [
						"The whole app: React and TypeScript on Vite, styled with Tailwind CSS, with React Router when it has more than one page. Run npm install, then npm run dev to work on it or npm run build to build it.",
					],
				},
			],
			share: ["Your code,", "on your GitHub."],
		},
		{
			slug: "limits",
			name: "What rwaft can't do yet",
			title: "Limits: what rwaft can and can't build yet",
			description:
				"What rwaft's AI app builder can't do yet: databases, logins, payments, file uploads, custom domains and private sites, and the usual way around each.",
			heading: "What rwaft can't do yet",
			lead: "rwaft builds websites and front-end apps that run in the browser. Here's what that rules out today, and the usual way around each.",
			sections: [
				{
					heading: "No back end",
					body: [
						{
							list: [
								"No database: an app can save data in the visitor's browser, but it won't sync between devices or people",
								"No logins or accounts",
								"No payments: link to a checkout you already use, like a Stripe payment link",
								"Forms don't save or send what visitors type: link to a form service like Google Forms or Tally",
							],
						},
					],
				},
				{
					heading: "Files and hosting",
					body: [
						{
							list: [
								"You can't upload images or files yet: use links to images that are already online",
								"Every site is public to anyone with its link",
								"No custom domains yet",
								"Up to five pages per site",
								"A site's code is kept for a day after each build; after that, describe it again to change it",
							],
						},
					],
				},
				{
					heading: "Building",
					body: [
						{
							list: [
								"Builds run one at a time, in a shared line",
								"Each person can start a limited number of builds per hour",
								"Repository deploys: public Vite and Create React App projects only, with no server code and no environment variables",
							],
						},
						{ link: { text: "Need a back end?", href: "/compare", label: "See how other builders compare" } },
					],
				},
			],
			share: ["What rwaft does,", "and doesn't, yet."],
		},
	]

	return docs.filter((doc) => doc.slug !== "push-to-github" || pricing.github)
}
