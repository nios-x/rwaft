# What you can do with rwaft

rwaft turns a description in plain words into a real website with its own link. You don't need to know how to code.

## Build a site by describing it

- Write what you want, who it's for and what it should do. For example: "a landing page for my bakery with our menu and opening hours".
- rwaft's AI plans your pages (up to 5), picks colours and fonts that fit, and writes each page.
- Every page shares the same look, with a header, a footer and navigation between pages.
- If something breaks while it's being built, rwaft fixes it on its own before showing it to you.

**Good for:** landing pages, portfolios, menus, event pages, trackers, simple games and other small tools.

## Change it with another message

- Not quite right? Send a follow-up like "make the header darker" or "add a contact page".
- rwaft updates your site and publishes the new version at a new link.
- It remembers what you asked for before, so you don't have to repeat yourself.

## Watch it being built

- Instead of a spinner, you see the real work as it happens, explained step by step in plain words.
- The full build log is one tap away if you're curious.
- A build takes a few minutes. If other people are building, you see your place in line, and yours starts on its own.
- You can close the tab. Your link works as soon as the site is live.

## Share your site

- Every site gets its own link, like `https://abc12345.rwaft.live`, ready to send to anyone.
- Preview it right inside rwaft, copy the link, or open it in a new tab.
- Your recent builds are listed on your device, so you can find them again.

## Your dashboard

- Signed in, open **Dashboard** from your account menu to see every project you've built, on any device.
- Each project shows its live link, how its latest build went, and where its code is on GitHub: the repository you pushed it to, the repository it was built from, or the pull request it opened.
- Search by name, link or prompt, and filter apps, repositories and pull requests.
- Open a project to see the live site, every version with its own link, and the credits it used. Copy the link, push the code to GitHub, or open any version in rwaft to keep changing it.
- **Deployments** lists every build, change and pull request in one place, newest first, with how long each took.
- Removing a project takes it off your dashboard. Its live site stays up.
- Builds from before the dashboard, or made before you signed in, show up on the device you made them on.

## Take your code with you

- **Push to GitHub:** send your site's code to a new public or private repository on your GitHub account. rwaft only uses your GitHub access for that one push.
- **Already have a project?** Paste a public GitHub, GitLab or Bitbucket link to a Vite or Create React App project, and rwaft builds and hosts it.

## Open a pull request on any GitHub repository

- Pick **Pull request**, paste a GitHub repository link and describe the change, like "add a dark mode toggle to the settings page".
- **Or paste an issue link** (github.com/owner/repo/issues/12). rwaft reads the issue and its comments as the request, and the pull request closes the issue when it's merged.
- GitHub asks you to approve access. rwaft's AI reads only the files it needs (it can search the code to find them), writes the change, and opens a pull request from your account on a new branch. If you can't push to the repository, it opens it from your fork.
- **Options:** pick a **Base** branch from the repository's own branches (with search), or open it as a **Draft**. Repositories you've used before are suggested as you type.
- **Private repositories just work:** rwaft checks whether it can see the repository and, if not, GitHub asks for access to your private repositories as well. There's nothing to tick.
- **Fix failing checks** (on by default): rwaft watches the pull request's CI. If a check fails, the AI reads its log and pushes a fix, up to 2 times, and tells you when everything passes.
- **Keep going in the chat:** describe another change and rwaft adds it to the same pull request as a new commit, with a comment saying what changed.
- The repository is never cloned: rwaft reads and writes through GitHub directly. Your GitHub access is revoked as soon as the job (and its check watching) ends.
- Each pull request, and each change added to one, costs **1 credit**, refunded if nothing reaches GitHub. Fixing failing checks is included.

## Credits

- Sign in with Google and get **2 free credits**.
- Each message you send is one build and costs **1 credit**. Deploying a repository also costs 1.
- **If a build fails, you get your credit back automatically.**
- Your balance is always on screen, and you see the cost before you build.
- Need more? Buy a pack. There's no subscription, and the price you see is the price you pay.

| Pack    | Credits | Price |
| ------- | ------- | ----- |
| Starter | 50      | $5    |
| Builder | 150     | $12   |
| Studio  | 400     | $28   |

## Good to know

- **Your site is public.** Anyone with the link can see it, so don't put anything private in your description.
- **Every site shows a small "Made with rwaft" link** in its bottom-right corner. It opens rwaft in a new tab.
- **Changes work for 24 hours.** rwaft keeps your site's code for a day after each build. After that, describe the whole site again to rebuild it.
- **Sites show information, they don't store it.** Forms, sign-ups or bookings on your site won't save or send what visitors type.
- **Light or dark.** The console follows your device's theme, or you can switch it yourself.
