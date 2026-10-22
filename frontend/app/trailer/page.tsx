import { SITE_URL } from "../../lib/site"
import { TRAILER, Trailer } from "../_components/InfoSections"
import { JsonLd, PageShell, pageMetadata } from "../_components/PageShell"

export const metadata = pageMetadata(
	"/trailer",
	"Trailer: watch rwaft build a live website in 29 seconds",
	"A 29-second look at rwaft's AI website builder: describe an app, watch the real build fix its own error, share the live link and change it by asking."
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
