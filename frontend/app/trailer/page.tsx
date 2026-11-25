import { SITE_URL } from "../../lib/site"
import { TRAILER, Trailer } from "../_components/InfoSections"
import { JsonLd, PageShell, pageMetadata } from "../_components/PageShell"

export const metadata = pageMetadata(
	"/trailer",
	"Trailer: rwaft, from idea to live link in 19 seconds",
	"A 19-second trailer for rwaft's AI website builder: describe an app, watch the real build fix its own errors, share the live link, change it by asking and open pull requests on any GitHub repository."
)

export default function TrailerPage() {
	// Lets search show the film as a video result, with its own thumbnail and length.
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "VideoObject",
		name: TRAILER.title,
		description: TRAILER.description,
		thumbnailUrl: `${SITE_URL}${TRAILER.poster}`,
		contentUrl: `${SITE_URL}${TRAILER.src}`,
		uploadDate: TRAILER.uploaded,
		duration: TRAILER.duration,
	}

	return (
		<PageShell current="/trailer" crumb={{ name: "Trailer", path: "/trailer" }}>
			<JsonLd data={jsonLd} />
			<main className="info">
				<Trailer />
			</main>
		</PageShell>
	)
}
