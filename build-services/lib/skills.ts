import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "node:url"
import { jobLog } from "./joblog.ts"

/**
 * Skills: instruction blocks kept as markdown in `build-services/skills/` and
 * appended to the AI's system prompt for the passes that need them.
 *
 * They live outside ai.ts on purpose. The base system prompt is about the
 * mechanics of the pipeline — which files exist, which tools to call, what has
 * to compile — and rarely changes. A skill is editorial guidance (how the
 * result should look, how to reason about a domain) that the author will want
 * to rewrite often, without touching worker code or redeploying a prompt
 * string. Loading them per-pass also keeps the repair conversation lean:
 * design guidance costs tokens that a build-error fix has no use for.
 */

const skillsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills")

/** Skill name -> body, or null for "looked and it isn't there". */
const cache = new Map<string, string | null>()

/** Leading YAML frontmatter: metadata for humans, noise for the model. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/

/**
 * Read one skill body. A missing or unreadable skill is a warning, never a
 * failed build — a user's app is still worth shipping without the guidance.
 */
export async function loadSkill(name: string): Promise<string | undefined> {
	const cached = cache.get(name)
	if (cached !== undefined) return cached ?? undefined

	// Names are internal constants today; the guard keeps a future
	// user-supplied one from reaching outside the skills directory.
	if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
		jobLog(`  ⚠ ignoring invalid skill name "${name}"`, "warn")
		cache.set(name, null)
		return undefined
	}

	try {
		const raw = await fs.readFile(path.join(skillsDir, `${name}.md`), "utf-8")
		const body = raw.replace(FRONTMATTER, "").trim()
		if (!body) throw new Error("skill file is empty")
		cache.set(name, body)
		return body
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		jobLog(`  ⚠ skill "${name}" could not be loaded: ${message}`, "warn")
		cache.set(name, null)
		return undefined
	}
}

/**
 * Append the requested skills to a base system prompt. Precedence is stated
 * explicitly: the base prompt's rules are what keep the project compiling, so
 * a skill can never talk the model out of them.
 */
export async function composeSystemPrompt(base: string, skills: string[]): Promise<string> {
	const sections: string[] = []
	for (const name of skills) {
		const body = await loadSkill(name)
		if (body) sections.push(`--- SKILL: ${name} ---\n\n${body}`)
	}
	if (sections.length === 0) return base

	return [
		base,
		"",
		"The skills below apply to this task. Treat them as binding requirements rather",
		"than suggestions, except where one contradicts the CRITICAL RULES or general",
		"rules above — those always win.",
		"",
		sections.join("\n\n")
	].join("\n")
}
