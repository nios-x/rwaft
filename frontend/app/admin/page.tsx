import type { Metadata } from "next"
import Link from "next/link"
import { AdminPanel } from "../_components/AdminPanel"
import { Mark } from "../_components/Icons"

export const metadata: Metadata = {
	title: "Admin",
	robots: { index: false, follow: false },
}

/** Accounts and their remaining credits. The API checks the password; this page only asks for it. */
export default function AdminPage() {
	return (
		<div className="app" data-screen="page">
			<header className="header">
				<Link href="/" className="brand" aria-label="rwaft home">
					<Mark className="brand-mark" />
					<span>rwaft</span>
				</Link>
			</header>
			<main className="admin-main">
				<AdminPanel />
			</main>
		</div>
	)
}
