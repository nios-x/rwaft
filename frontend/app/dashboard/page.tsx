import type { Metadata } from "next"
import { Dashboard } from "../_components/Dashboard"

export const metadata: Metadata = {
	title: "Dashboard",
	description: "Your rwaft projects: every app, its live link, its versions and its code on GitHub.",
	// A signed-in page with nothing for search engines; it sets its own
	// canonical so it doesn't inherit the home page's.
	alternates: { canonical: "/dashboard" },
	robots: { index: false, follow: false },
}

/** Everything here depends on the visitor's session, so it renders in the browser (app/_components/Dashboard.tsx). */
export default function DashboardPage() {
	return <Dashboard />
}
