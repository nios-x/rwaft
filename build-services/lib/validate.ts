/**
 * Post-build validation: things a green bundle can still be wrong about.
 */

import { run } from "./run.ts"

const TYPECHECK_TIMEOUT_MS = Number(process.env.TYPECHECK_TIMEOUT_MS || 120_000)

/**
 * TypeScript codes meaning "this identifier does not exist".
 *
 * TS2304 is `Cannot find name 'x'`; TS2552 is the same with a spelling
 * suggestion attached. Both are guaranteed runtime ReferenceErrors, which is
 * what separates them from the cosmetic diagnostics we deliberately ignore.
 */
const UNDEFINED_NAME_CODES = ["TS2304", "TS2552"]

/** Picks the fatal lines out of a tsc run. Exported for testing. */
export function undefinedNameErrors(tscOutput: string): string[] {
	return tscOutput
		.split("\n")
		.filter((line) => UNDEFINED_NAME_CODES.some((code) => line.includes(`error ${code}:`)))
		.map((line) => line.trim())
}

/**
 * Fails a build that references names which do not exist.
 *
 * scaffoldViteProject deliberately rewrites the template's `tsc && vite build`
 * down to `vite build`, because tsc as a build gate fails AI-generated code on
 * cosmetic type complaints that Vite bundles through happily. That trade is the
 * right one, but it also removed the only thing catching an undefined
 * identifier — and that one is not cosmetic. A deployment shipped a
 * module-scope style object reading `playerX`, a component state variable: the
 * bundle built, five artifacts uploaded, the job reported "live", and the page
 * died on load with `Uncaught ReferenceError: playerX is not defined`.
 *
 * So run the checker and discard everything it says except the codes that mean
 * a name is not defined. The throw lands in the caller's repair loop, which
 * already knows how to ask the AI to fix a failed build.
 *
 * Deliberately fail-open. A non-zero exit is the normal case here (cosmetic
 * errors are expected), and if the checker cannot run at all there are no
 * matching lines, so a missing toolchain lets the build through rather than
 * blocking every deploy.
 */
export async function assertNoUndefinedIdentifiers(projectDir: string): Promise<void> {
	let output: string
	try {
		output = (await run("npx --no-install tsc --noEmit", {
			cwd: projectDir,
			timeoutMs: TYPECHECK_TIMEOUT_MS
		})).output
	} catch (error) {
		// tsc exits non-zero for ANY diagnostic, so this is the expected path.
		output = error instanceof Error ? error.message : String(error)
	}

	const fatal = undefinedNameErrors(output)
	if (fatal.length === 0) return

	throw new Error(
		`The code references names that do not exist, so the page would crash on load ` +
		`even though the bundle built:\n\n${fatal.join("\n")}\n\n` +
		`A value that lives inside a component (state, props, a local) cannot be read ` +
		`from module scope. Move the usage inside the component, or lift the value out of it.`
	)
}
